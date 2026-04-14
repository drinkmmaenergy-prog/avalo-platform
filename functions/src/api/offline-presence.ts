import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

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
import { HttpsError, admin, auth, onCall, logger, onSchedule } from '../runtime';

/**
 * Generate QR profile for authenticated user
 */
export const generateUserQRProfile = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const qrProfile = await getOrCreateQRProfile(request.auth.uid);
    console.log('Scheduled job result:', { success: true, qrProfile });

    return;
  } catch (error: any) {
    console.error('Error generating QR profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get QR variations (multiple sizes/formats)
 */
export const getQRVariations = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const variations = await generateQRVariations(request.auth.uid);
    console.log('Scheduled job result:', { success: true, variations });

    return;
  } catch (error: any) {
    console.error('Error generating QR variations:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Regenerate QR profile (after username change)
 */
export const regenerateUserQRProfile = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const qrProfile = await regenerateQRProfile(request.auth.uid);
    console.log('Scheduled job result:', { success: true, qrProfile });

    return;
  } catch (error: any) {
    console.error('Error regenerating QR profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate poster/print material
 */
export const createPoster = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
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
      request.auth.uid,
      format as PosterFormat,
      {
        displayName,
        tagline,
        profilePhoto,
        customText,
      }
    );

    console.log('Scheduled job result:', { success: true, poster });


    return;
  } catch (error: any) {
    console.error('Error creating poster:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate event poster bundle
 */
export const createEventPosterBundle = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { eventId, eventName, organizer, earners } = data;

  if (!eventId || !eventName || !organizer || !Array.isArray(earners)) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const posterIds = await generateEventBundle(eventId, {
      name: eventName,
      organizer,
      earners,
    });

    console.log('Scheduled job result:', { success: true, posterIds });


    return;
  } catch (error: any) {
    console.error('Error creating event bundle:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit poster for moderation review
 */
export const submitPosterForReview = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { assetId } = data;

  if (!assetId) {
    throw new functions.https.HttpsError('invalid-argument', 'Asset ID is required');
  }

  const assetDoc = await db.collection('offline_assets').doc(assetId).get();
  if (!assetDoc.exists || assetDoc.data()?.userId !== request.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Asset not found or access denied');
  }

  try {
    await submitForReview(assetId);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    console.error('Error submitting poster for review:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Moderate poster (admin only)
 */
export const moderatePoster = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { assetId, decision, rejectionReason } = data;

  if (!assetId || !decision || !['approved', 'rejected'].includes(decision)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid moderation data');
  }

  try {
    await moderatePosterAsset(assetId, request.auth.uid, decision, rejectionReason);
    console.log('Scheduled job result:', { success: true });

    return;
  } catch (error: any) {
    console.error('Error moderating poster:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get user's offline assets
 */
export const getMyOfflineAssets = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  try {
    const assets = await getUserAssets(request.auth.uid);
    console.log('Scheduled job result:', { success: true, assets });

    return;
  } catch (error: any) {
    console.error('Error getting offline assets:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Log QR scan event (public endpoint - no auth required)
 */
export const recordQRScan = functions.https.onCall(async (request) => {
  const data = request.data;
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

    console.log('Scheduled job result:', { success: true });


    return;
  } catch (error: any) {
    console.error('Error logging scan:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scan analytics for authenticated user
 */
export const getMyScanAnalytics = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { period, startDate, endDate } = data;

  if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid period');
  }

  try {
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await getScanAnalytics(request.auth.uid, period, start, end);
    console.log('Scheduled job result:', { success: true, analytics });

    return;
  } catch (error: any) {
    console.error('Error getting scan analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scan summary dashboard
 */
export const getMyScanSummary = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { days } = data;
  const daysToAnalyze = days && days > 0 && days <= 90 ? days : 7;

  try {
    const [totalScans, recentSummary, topCities, deviceBreakdown] = await Promise.all([
      getTotalScans(request.auth.uid),
      getRecentScansSummary(request.auth.uid, daysToAnalyze),
      getScansByCity(request.auth.uid, 5),
      getScansByDevice(request.auth.uid),
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
export const cleanupOldScanLogs = onSchedule("every 24 hours", async (event) => {
    const { ScanTracker } = await import('../services/offline-presence');
    await ScanTracker.cleanupOldScans();
    console.log('Old scan logs cleanup completed');
  });



























