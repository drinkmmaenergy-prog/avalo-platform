/**
 * PACK 135: Offline Presence API Endpoints
 * Cloud Functions for QR codes, posters, and scan tracking
 */

import * as functions from 'firebase-functions';
import { db } from '../init';
import {
  generateQRProfile,
  generateQRVariations,
  getOrCreateQRProfile,
  regenerateQRProfile,
  generatePoster,
  generateEventBundle,
  submitForReview,
  moderatePosterAsset,
  getUserAssets,
  logScan,
  getScanAnalytics,
  getTotalScans,
  getScansByCity,
  getScansByDevice,
  getRecentScansSummary,
  PosterFormat,
} from '../services/offline-presence';

/**
 * Generate QR profile for authenticated user
 */
export const generateUserQRProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const qrProfile = await getOrCreateQRProfile(context.auth.uid);
    return { success: true, qrProfile };
  } catch (error: any) {
    console.error('Error generating QR profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get QR variations (multiple sizes/formats)
 */
export const getQRVariations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const variations = await generateQRVariations(context.auth.uid);
    return { success: true, variations };
  } catch (error: any) {
    console.error('Error generating QR variations:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Regenerate QR profile (after username change)
 */
export const regenerateUserQRProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const qrProfile = await regenerateQRProfile(context.auth.uid);
    return { success: true, qrProfile };
  } catch (error: any) {
    console.error('Error regenerating QR profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate poster/print material
 */
export const createPoster = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { format, displayName, tagline, profilePhoto, customText } = data;

  if (!format || !displayName) {
    throw new functions.https.HttpsError('invalid-argument', 'Format and display name are required');
  }

  const validFormats: PosterFormat[] = ['square', 'vertical', 'horizontal', 'business-card', 'sticker', 'badge'];
  if (!validFormats.includes(format)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid format');
  }

  try {
    const poster = await generatePoster(
      context.auth.uid,
      format as PosterFormat,
      {
        displayName,
        tagline,
        profilePhoto,
        customText,
      }
    );

    return { success: true, poster };
  } catch (error: any) {
    console.error('Error creating poster:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate event poster bundle
 */
export const createEventPosterBundle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { eventId, eventName, organizer, creators } = data;

  if (!eventId || !eventName || !organizer || !Array.isArray(creators)) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const posterIds = await generateEventBundle(eventId, {
      name: eventName,
      organizer,
      creators,
    });

    return { success: true, posterIds };
  } catch (error: any) {
    console.error('Error creating event bundle:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit poster for moderation review
 */
export const submitPosterForReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { assetId } = data;

  if (!assetId) {
    throw new functions.https.HttpsError('invalid-argument', 'Asset ID is required');
  }

  const assetDoc = await db.collection('offline_assets').doc(assetId).get();
  if (!assetDoc.exists || assetDoc.data()?.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Asset not found or access denied');
  }

  try {
    await submitForReview(assetId);
    return { success: true };
  } catch (error: any) {
    console.error('Error submitting poster for review:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Moderate poster (admin only)
 */
export const moderatePoster = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { assetId, decision, rejectionReason } = data;

  if (!assetId || !decision || !['approved', 'rejected'].includes(decision)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid moderation data');
  }

  try {
    await moderatePosterAsset(assetId, context.auth.uid, decision, rejectionReason);
    return { success: true };
  } catch (error: any) {
    console.error('Error moderating poster:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's offline assets
 */
export const getMyOfflineAssets = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const assets = await getUserAssets(context.auth.uid);
    return { success: true, assets };
  } catch (error: any) {
    console.error('Error getting offline assets:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Log QR scan event (public endpoint - no auth required)
 */
export const recordQRScan = functions.https.onCall(async (data, context) => {
  const { profileUserId, assetId, deviceInfo, location } = data;

  if (!profileUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Profile user ID is required');
  }

  try {
    await logScan({
      profileUserId,
      assetId,
      deviceInfo,
      location,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error logging scan:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scan analytics for authenticated user
 */
export const getMyScanAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { period, startDate, endDate } = data;

  if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid period');
  }

  try {
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await getScanAnalytics(context.auth.uid, period, start, end);
    return { success: true, analytics };
  } catch (error: any) {
    console.error('Error getting scan analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scan summary dashboard
 */
export const getMyScanSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { days } = data;
  const daysToAnalyze = days && days > 0 && days <= 90 ? days : 7;

  try {
    const [totalScans, recentSummary, topCities, deviceBreakdown] = await Promise.all([
      getTotalScans(context.auth.uid),
      getRecentScansSummary(context.auth.uid, daysToAnalyze),
      getScansByCity(context.auth.uid, 5),
      getScansByDevice(context.auth.uid),
    ]);

    return {
      success: true,
      summary: {
        totalScans,
        recent: recentSummary,
        topCities,
        deviceBreakdown,
      },
    };
  } catch (error: any) {
    console.error('Error getting scan summary:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled cleanup of old scan logs (runs daily)
 */
export const cleanupOldScanLogs = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const { ScanTracker } = await import('../services/offline-presence');
    await ScanTracker.cleanupOldScans();
    console.log('Old scan logs cleanup completed');
  });