/**
 * PACK 154 — Avalo Multilingual AI Moderation & Auto-Translation Layer
 * Cloud Functions Endpoints
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, admin } from './init';
import {
  translateMessageSafely,
  translateVoiceSafely,
  detectLanguage,
} from './pack154-translation-system';
import {
  TranslationRequest,
  TranslationAppeal,
  AppealStatus,
  AppealDecision,
  TranslationPreferences,
} from './types/translation.types';

// ============================================================================
// Translation Functions
// ============================================================================

/**
 * Translate message with safety checks
 */
export const pack154_translateMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const request: TranslationRequest = {
    content: data.content,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    contentType: data.contentType || 'TEXT_MESSAGE',
    contextUserId: userId,
    targetUserId: data.targetUserId,
    channelType: data.channelType || 'direct_message',
    messageId: data.messageId,
  };

  // Validate input
  if (!request.content || !request.targetLanguage) {
    throw new functions.https.HttpsError('invalid-argument', 'Content and target language are required');
  }

  if (request.content.length > 5000) {
    throw new functions.https.HttpsError('invalid-argument', 'Content too long (max 5000 characters)');
  }

  const result = await translateMessageSafely(request);
  
  return {
    success: result.success,
    translatedContent: result.translatedContent,
    detectedSourceLanguage: result.detectedSourceLanguage,
    targetLanguage: result.targetLanguage,
    blocked: result.blocked,
    blockReason: result.blockReason,
    translationId: result.translationId,
    messageToUser: result.messageToUser,
    appealEligible: result.appealEligible,
  };
});

/**
 * Translate voice transcript with audio safety checks
 */
export const pack154_translateVoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const request = {
    transcript: data.transcript,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    callId: data.callId,
    participantId: userId,
    timestamp: Date.now(),
  };

  if (!request.transcript || !request.targetLanguage || !request.callId) {
    throw new functions.https.HttpsError('invalid-argument', 'Transcript, target language, and call ID are required');
  }

  const result = await translateVoiceSafely(request);

  return {
    success: result.success,
    translatedContent: result.translatedContent,
    detectedSourceLanguage: result.detectedSourceLanguage,
    targetLanguage: result.targetLanguage,
    blocked: result.blocked,
    shouldMute: result.shouldMute,
    muteReason: result.muteReason,
    translationId: result.translationId,
    appealEligible: result.appealEligible,
  };
});

/**
 * Detect language of text
 */
export const pack154_detectLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { text } = data;

  if (!text) {
    throw new functions.https.HttpsError('invalid-argument', 'Text is required');
  }

  if (text.length > 1000) {
    throw new functions.https.HttpsError('invalid-argument', 'Text too long for detection (max 1000 characters)');
  }

  const result = await detectLanguage(text);

  return result;
});

// ============================================================================
// User Preferences
// ============================================================================

/**
 * Get user translation preferences
 */
export const pack154_getPreferences = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const doc = await db.collection('translation_preferences').doc(userId).get();

  if (!doc.exists) {
    // Return defaults
    return {
      autoTranslate: false,
      bilingualMode: false,
      targetLanguages: ['en'],
      preserveHumor: true,
    };
  }

  return doc.data();
});

/**
 * Update user translation preferences
 */
export const pack154_updatePreferences = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const preferences: Partial<TranslationPreferences> = {
    userId,
    autoTranslate: data.autoTranslate ?? false,
    bilingualMode: data.bilingualMode ?? false,
    targetLanguages: data.targetLanguages || ['en'],
    dialectPreference: data.dialectPreference,
    preserveHumor: data.preserveHumor ?? true,
    updatedAt: Date.now(),
  };

  const docRef = db.collection('translation_preferences').doc(userId);
  const doc = await docRef.get();

  if (doc.exists) {
    await docRef.update(preferences);
  } else {
    await docRef.set({
      ...preferences,
      createdAt: Date.now(),
    });
  }

  return { success: true };
});

// ============================================================================
// Translation History & Stats
// ============================================================================

/**
 * Get user's translation history
 */
export const pack154_getTranslationHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 50;

  const snapshot = await db
    .collection('translation_logs')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const translations = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      translationId: data.translationId,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      contentType: data.contentType,
      blocked: data.blocked,
      blockReason: data.blockReason,
      timestamp: data.timestamp,
      appealEligible: data.appealStatus === null && data.blocked,
    };
  });

  return { translations };
});

/**
 * Get blocked translations for user
 */
export const pack154_getBlockedTranslations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 20;

  const snapshot = await db
    .collection('translation_logs')
    .where('userId', '==', userId)
    .where('blocked', '==', true)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const blockedTranslations = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      translationId: data.translationId,
      blockReason: data.blockReason,
      contentType: data.contentType,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      timestamp: data.timestamp,
      appealEligible: data.appealStatus === null,
      appealStatus: data.appealStatus,
    };
  });

  return { blockedTranslations };
});

// ============================================================================
// Appeals System
// ============================================================================

/**
 * Submit appeal for blocked translation
 */
export const pack154_submitAppeal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { translationId, reason, evidence } = data;

  if (!translationId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Translation ID and reason are required');
  }

  // Get translation log
  const translationDoc = await db.collection('translation_logs').doc(translationId).get();
  
  if (!translationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Translation not found');
  }

  const translation = translationDoc.data()!;

  if (translation.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your translation');
  }

  if (!translation.blocked) {
    throw new functions.https.HttpsError('invalid-argument', 'Translation was not blocked');
  }

  if (translation.appealStatus) {
    throw new functions.https.HttpsError('already-exists', 'Appeal already submitted');
  }

  // Create appeal
  const appealId = generateId();

  const appeal: Partial<TranslationAppeal> = {
    id: appealId,
    translationId,
    userId,
    reason,
    evidence: evidence || undefined,
    originalContent: translation.content,
    translatedAttempt: translation.translatedContent || '[BLOCKED]',
    blockReason: translation.blockReason,
    status: 'pending',
    submittedAt: Date.now(),
  };

  await db.collection('translation_appeals').doc(appealId).set(appeal);

  // Update translation log
  await db.collection('translation_logs').doc(translationId).update({
    appealedAt: Date.now(),
    appealStatus: 'pending',
  });

  return {
    success: true,
    appealId,
    message: 'Appeal submitted successfully. We will review it within 24-48 hours.',
  };
});

/**
 * Get user's appeal history
 */
export const pack154_getMyAppeals = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const snapshot = await db
    .collection('translation_appeals')
    .where('userId', '==', userId)
    .orderBy('submittedAt', 'desc')
    .limit(50)
    .get();

  const appeals = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      appealId: data.id,
      translationId: data.translationId,
      blockReason: data.blockReason,
      status: data.status,
      submittedAt: data.submittedAt,
      reviewedAt: data.reviewedAt,
      decision: data.decision,
      reviewerNotes: data.reviewerNotes,
    };
  });

  return { appeals };
});

/**
 * Check if translation is eligible for appeal
 */
export const pack154_checkAppealEligibility = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { translationId } = data;

  if (!translationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Translation ID required');
  }

  const translationDoc = await db.collection('translation_logs').doc(translationId).get();

  if (!translationDoc.exists) {
    return { eligible: false, reason: 'Translation not found' };
  }

  const translation = translationDoc.data()!;

  if (translation.userId !== userId) {
    return { eligible: false, reason: 'Not your translation' };
  }

  if (!translation.blocked) {
    return { eligible: false, reason: 'Translation was not blocked' };
  }

  if (translation.appealStatus) {
    return { eligible: false, reason: 'Appeal already submitted' };
  }

  // Check if block reason allows appeals
  const nonAppealableReasons = ['NSFW_CONTENT', 'SOURCE_ALREADY_BLOCKED'];
  if (nonAppealableReasons.includes(translation.blockReason)) {
    return { eligible: false, reason: 'This type of block cannot be appealed' };
  }

  return {
    eligible: true,
    blockReason: translation.blockReason,
    timestamp: translation.timestamp,
  };
});

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Review translation appeal (admin only)
 */
export const pack154_admin_reviewAppeal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  
  if (!userData || userData.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { appealId, approved, reviewerNotes } = data;

  if (!appealId || approved === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'Appeal ID and decision required');
  }

  const appealDoc = await db.collection('translation_appeals').doc(appealId).get();

  if (!appealDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Appeal not found');
  }

  const appeal = appealDoc.data() as TranslationAppeal;

  let decision: AppealDecision;
  let status: AppealStatus;

  if (approved) {
    decision = 'allow_translation';
    status = 'approved';
  } else {
    decision = 'keep_blocked';
    status = 'rejected';
  }

  // Update appeal
  await db.collection('translation_appeals').doc(appealId).update({
    status,
    decision,
    reviewedAt: Date.now(),
    reviewedBy: context.auth.uid,
    reviewerNotes: reviewerNotes || '',
  });

  // Update translation log
  await db.collection('translation_logs').doc(appeal.translationId).update({
    appealStatus: status,
  });

  return { success: true, decision };
});

/**
 * Get pending appeals (admin only)
 */
export const pack154_admin_getPendingAppeals = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  
  if (!userData || userData.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const snapshot = await db
    .collection('translation_appeals')
    .where('status', '==', 'pending')
    .orderBy('submittedAt', 'asc')
    .limit(50)
    .get();

  const appeals = snapshot.docs.map(doc => doc.data());

  return { appeals };
});

/**
 * Get translation statistics (admin only)
 */
export const pack154_admin_getStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  
  if (!userData || userData.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Get stats for last 24 hours
  const last24hSnapshot = await db
    .collection('translation_logs')
    .where('timestamp', '>=', oneDayAgo)
    .get();

  // Get stats for last week
  const lastWeekSnapshot = await db
    .collection('translation_logs')
    .where('timestamp', '>=', oneWeekAgo)
    .get();

  const last24hBlocked = last24hSnapshot.docs.filter(doc => doc.data().blocked).length;
  const lastWeekBlocked = lastWeekSnapshot.docs.filter(doc => doc.data().blocked).length;

  return {
    last24h: {
      total: last24hSnapshot.size,
      blocked: last24hBlocked,
      blockRate: last24hSnapshot.size > 0 ? (last24hBlocked / last24hSnapshot.size) * 100 : 0,
    },
    lastWeek: {
      total: lastWeekSnapshot.size,
      blocked: lastWeekBlocked,
      blockRate: lastWeekSnapshot.size > 0 ? (lastWeekBlocked / lastWeekSnapshot.size) * 100 : 0,
    },
  };
});