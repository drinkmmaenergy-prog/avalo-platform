/**
 * PACK 394 — Viral Growth Engine
 * Referral & Invite Engine (Core)
 * 
 * Handles all referral link generation, tracking, and attribution
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';

const db = admin.firestore();

// Referral Types
export enum ReferralType {
  DIRECT_INVITE = 'direct_invite',
  QR_INVITE = 'qr_invite',
  PROFILE_TO_PROFILE = 'profile_to_profile',
  EVENT_INVITE = 'event_invite',
}

// Referral Source
export enum ReferralSource {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  LINK = 'link',
  QR = 'qr',
}

interface ReferralLink {
  linkId: string;
  inviterId: string;
  referralType: ReferralType;
  code: string;
  deepLink: string;
  qrCodeUrl?: string;
  eventId?: string;
  createdAt: Date;
  expiresAt?: Date;
  maxUses?: number;
  currentUses: number;
  isActive: boolean;
  metadata: {
    campaignName?: string;
    customMessage?: string;
  };
}

interface ReferralEvent {
  eventId: string;
  linkId: string;
  inviterId: string;
  inviteeId?: string;
  inviteeDeviceHash?: string;
  geo: {
    country: string;
    city?: string;
    lat?: number;
    lng?: number;
  };
  timestamp: Date;
  source: ReferralSource;
  status: 'clicked' | 'installed' | 'registered' | 'verified' | 'first_chat' | 'first_purchase';
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    referrerUrl?: string;
  };
}

/**
 * Generate Referral Link
 * Creates a unique referral link for a user
 */
export const generateReferralLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    referralType = ReferralType.DIRECT_INVITE,
    eventId,
    campaignName,
    customMessage,
    maxUses,
    expiresInDays,
  } = data;

  try {
    // Check user exists and is verified
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    if (!userData?.verified || !userData?.ageVerified) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'User must be verified to generate referral links'
      );
    }

    // Generate unique code
    const code = nanoid(10);
    const linkId = nanoid(16);

    // Create deep link
    const deepLink = `https://avalo.app/invite/${code}`;
    
    // Calculate expiration
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const referralLink: ReferralLink = {
      linkId,
      inviterId: userId,
      referralType,
      code,
      deepLink,
      eventId,
      createdAt: new Date(),
      expiresAt,
      maxUses,
      currentUses: 0,
      isActive: true,
      metadata: {
        campaignName,
        customMessage,
      },
    };

    // Save to Firestore
    await db.collection('referralLinks').doc(linkId).set(referralLink);

    // Generate QR code if needed
    if (referralType === ReferralType.QR_INVITE) {
      const qrCodeUrl = await generateQRCode(deepLink);
      await db.collection('referralLinks').doc(linkId).update({ qrCodeUrl });
      referralLink.qrCodeUrl = qrCodeUrl;
    }

    // Track link generation event
    await db.collection('referralEvents').add({
      eventId: nanoid(16),
      linkId,
      inviterId: userId,
      timestamp: new Date(),
      source: referralType === ReferralType.QR_INVITE ? ReferralSource.QR : ReferralSource.LINK,
      status: 'clicked',
      metadata: {},
    });

    functions.logger.info(`Referral link generated: ${linkId} for user ${userId}`);

    return {
      success: true,
      referralLink,
    };
  } catch (error: any) {
    functions.logger.error('Error generating referral link:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Track Referral Event
 * Tracks user interactions with referral links
 */
export const trackReferralEvent = functions.https.onCall(async (data, context) => {
  const {
    code,
    status,
    source,
    deviceHash,
    geo,
    metadata,
  } = data;

  try {
    // Find referral link by code
    const linkSnapshot = await db.collection('referralLinks')
      .where('code', '==', code)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (linkSnapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'Referral link not found');
    }

    const linkDoc = linkSnapshot.docs[0];
    const linkData = linkDoc.data() as ReferralLink;

    // Check if link is expired
    if (linkData.expiresAt && linkData.expiresAt < new Date()) {
      await linkDoc.ref.update({ isActive: false });
      throw new functions.https.HttpsError('failed-precondition', 'Referral link has expired');
    }

    // Check max uses
    if (linkData.maxUses && linkData.currentUses >= linkData.maxUses) {
      await linkDoc.ref.update({ isActive: false });
      throw new functions.https.HttpsError('failed-precondition', 'Referral link has reached max uses');
    }

    const eventId = nanoid(16);
    const referralEvent: ReferralEvent = {
      eventId,
      linkId: linkDoc.id,
      inviterId: linkData.inviterId,
      inviteeId: context.auth?.uid,
      inviteeDeviceHash: deviceHash,
      geo: geo || { country: 'unknown' },
      timestamp: new Date(),
      source: source || ReferralSource.LINK,
      status,
      metadata: metadata || {},
    };

    // Save referral event
    await db.collection('referralEvents').doc(eventId).set(referralEvent);

    // Increment use count
    await linkDoc.ref.update({
      currentUses: admin.firestore.FieldValue.increment(1),
    });

    // Update attribution on user if registered
    if (context.auth?.uid && status === 'registered') {
      await db.collection('users').doc(context.auth.uid).update({
        'referral.inviterId': linkData.inviterId,
        'referral.linkId': linkDoc.id,
        'referral.code': code,
        'referral.source': source,
        'referral.timestamp': new Date(),
      });
    }

    functions.logger.info(`Referral event tracked: ${eventId} - ${status}`);

    return {
      success: true,
      eventId,
    };
  } catch (error: any) {
    functions.logger.error('Error tracking referral event:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get User Referral Stats
 * Returns referral statistics for a user
 */
export const getUserReferralStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Get all referral links
    const linksSnapshot = await db.collection('referralLinks')
      .where('inviterId', '==', userId)
      .get();

    const linkIds = linksSnapshot.docs.map(doc => doc.id);

    // Get all referral events
    const eventsSnapshot = await db.collection('referralEvents')
      .where('inviterId', '==', userId)
      .get();

    const events = eventsSnapshot.docs.map(doc => doc.data() as ReferralEvent);

    // Calculate stats
    const stats = {
      totalLinks: linksSnapshot.size,
      activeLinks: linksSnapshot.docs.filter(doc => doc.data().isActive).length,
      totalInvites: events.length,
      clicks: events.filter(e => e.status === 'clicked').length,
      installs: events.filter(e => e.status === 'installed').length,
      registrations: events.filter(e => e.status === 'registered').length,
      verified: events.filter(e => e.status === 'verified').length,
      firstChats: events.filter(e => e.status === 'first_chat').length,
      firstPurchases: events.filter(e => e.status === 'first_purchase').length,
      conversionRate: 0,
      topSources: {} as Record<string, number>,
    };

    // Calculate conversion rate
    if (stats.clicks > 0) {
      stats.conversionRate = (stats.registrations / stats.clicks) * 100;
    }

    // Calculate top sources
    events.forEach(event => {
      stats.topSources[event.source] = (stats.topSources[event.source] || 0) + 1;
    });

    return {
      success: true,
      stats,
    };
  } catch (error: any) {
    functions.logger.error('Error getting referral stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Referral Leaderboard
 * Returns top referrers
 */
export const getReferralLeaderboard = functions.https.onCall(async (data, context) => {
  const { limit = 100, timeframe = '30d' } = data;

  try {
    // Calculate timeframe
    const now = new Date();
    const startDate = new Date(now.getTime() - getTimeframeMs(timeframe));

    // Get all referral events in timeframe
    const eventsSnapshot = await db.collection('referralEvents')
      .where('timestamp', '>=', startDate)
      .get();

    const events = eventsSnapshot.docs.map(doc => doc.data() as ReferralEvent);

    // Group by inviterId
    const inviterStats: Record<string, {
      inviterId: string;
      totalInvites: number;
      verified: number;
      firstPurchases: number;
      score: number;
    }> = {};

    events.forEach(event => {
      if (!inviterStats[event.inviterId]) {
        inviterStats[event.inviterId] = {
          inviterId: event.inviterId,
          totalInvites: 0,
          verified: 0,
          firstPurchases: 0,
          score: 0,
        };
      }

      inviterStats[event.inviterId].totalInvites++;
      
      if (event.status === 'verified') {
        inviterStats[event.inviterId].verified++;
      }
      
      if (event.status === 'first_purchase') {
        inviterStats[event.inviterId].firstPurchases++;
      }

      // Calculate score (weighted)
      inviterStats[event.inviterId].score = 
        inviterStats[event.inviterId].verified * 10 +
        inviterStats[event.inviterId].firstPurchases * 100;
    });

    // Sort by score
    const leaderboard = Object.values(inviterStats)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Fetch user details
    const leaderboardWithUsers = await Promise.all(
      leaderboard.map(async (entry) => {
        const userDoc = await db.collection('users').doc(entry.inviterId).get();
        const userData = userDoc.data();
        
        return {
          ...entry,
          userName: userData?.name || 'Unknown',
          userPhoto: userData?.photos?.[0]?.url || null,
          isCreator: userData?.creator?.verified || false,
        };
      })
    );

    return {
      success: true,
      leaderboard: leaderboardWithUsers,
    };
  } catch (error: any) {
    functions.logger.error('Error getting referral leaderboard:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Helper function to generate QR code
 */
async function generateQRCode(url: string): Promise<string> {
  // Placeholder - integrate with QR code service
  // e.g., qrserver.com or similar
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
}

/**
 * Helper function to convert timeframe to milliseconds
 */
function getTimeframeMs(timeframe: string): number {
  const matches = timeframe.match(/^(\d+)([dhm])$/);
  if (!matches) return 30 * 24 * 60 * 60 * 1000; // Default 30 days

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
 * Scheduled function to cleanup expired referral links
 */
export const cleanupExpiredReferralLinks = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = new Date();
    
    const expiredLinksSnapshot = await db.collection('referralLinks')
      .where('isActive', '==', true)
      .where('expiresAt', '<', now)
      .get();

    const batch = db.batch();
    expiredLinksSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { isActive: false });
    });

    await batch.commit();

    functions.logger.info(`Deactivated ${expiredLinksSnapshot.size} expired referral links`);
    
    return null;
  });
