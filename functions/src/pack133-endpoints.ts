/**
 * PACK 133 — AI Creative Studio Cloud Functions
 * 
 * Callable endpoints for AI media enhancement:
 * - Rate-limited for fair access
 * - Authenticated users only
 * - Full safety validation
 * - Zero monetization impact
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import {
  enhanceImage,
  enhanceVideo,
  enhanceAudio,
  generateText,
} from './pack133-ai-processing-engine';
import {
  EnhanceImageRequest,
  EnhanceImageResponse,
  EnhanceVideoRequest,
  EnhanceVideoResponse,
  EnhanceAudioRequest,
  EnhanceAudioResponse,
  GenerateCaptionRequest,
  GenerateCaptionResponse,
  TranslateTextRequest,
  TranslateTextResponse,
  GetAIStudioDashboardRequest,
  GetAIStudioDashboardResponse,
  ToggleAIBadgeRequest,
  ToggleAIBadgeResponse,
  AIStudioDashboard,
  AIStudioErrorCode,
} from './pack133-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMITS = {
  IMAGE: { perHour: 50, perDay: 200 },
  VIDEO: { perHour: 10, perDay: 50 },
  AUDIO: { perHour: 20, perDay: 100 },
  TEXT: { perHour: 100, perDay: 500 },
};

async function checkRateLimit(
  userId: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TEXT'
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check hourly limit
    const hourlyCount = await db
      .collection('ai_enhancement_requests')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(oneHourAgo))
      .count()
      .get();

    const limits = RATE_LIMITS[type];
    
    if (hourlyCount.data().count >= limits.perHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.perHour} ${type.toLowerCase()} enhancements per hour`,
      };
    }

    // Check daily limit
    const dailyCount = await db
      .collection('ai_enhancement_requests')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(oneDayAgo))
      .count()
      .get();

    if (dailyCount.data().count >= limits.perDay) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.perDay} ${type.toLowerCase()} enhancements per day`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return { allowed: true }; // Fail open
  }
}

// ============================================================================
// IMAGE ENHANCEMENT ENDPOINT
// ============================================================================

export const pack133_enhanceImage = functions.https.onCall(
  async (data: EnhanceImageRequest, context): Promise<EnhanceImageResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      // Rate limit check
      const rateCheck = await checkRateLimit(userId, 'IMAGE');
      if (!rateCheck.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', rateCheck.reason!);
      }

      // Validate input
      if (!data.mediaId || !data.inputUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }

      // Get user context
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      // Process enhancement
      const result = await enhanceImage({
        userId,
        mediaId: data.mediaId,
        inputUrl: data.inputUrl,
        enhancements: {
          lightingCorrection: data.lightingCorrection,
          colorCorrection: data.colorCorrection,
          contrastClarity: data.contrastClarity,
          noiseRemoval: data.noiseRemoval,
          sharpening: data.sharpening,
          dynamicCrop: data.dynamicCrop,
          acneSmoothing: data.acneSmoothing,
        },
        safetyContext: {
          isAdultVerified: userData?.ageVerified === true,
          contentType: 'AI_ENHANCED_IMAGE',
        },
      });

      return {
        requestId: result.requestId,
        status: result.status,
        outputUrl: result.outputUrl,
        safetyCheck: {
          passed: result.safetyCheck.result === 'PASS',
          reason: result.safetyCheck.reason,
        },
        metadata: {
          processingTime: result.metadata.processingTime,
          enhancements: result.enhancements,
        },
      };
    } catch (error: any) {
      console.error('Image enhancement endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// VIDEO ENHANCEMENT ENDPOINT
// ============================================================================

export const pack133_enhanceVideo = functions.https.onCall(
  async (data: EnhanceVideoRequest, context): Promise<EnhanceVideoResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const rateCheck = await checkRateLimit(userId, 'VIDEO');
      if (!rateCheck.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', rateCheck.reason!);
      }

      if (!data.mediaId || !data.inputUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }

      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      const result = await enhanceVideo({
        userId,
        mediaId: data.mediaId,
        inputUrl: data.inputUrl,
        enhancements: {
          noiseReduction: data.noiseReduction,
          stabilization: data.stabilization,
          aspectRatioFraming: data.aspectRatioFraming,
          autoSubtitles: data.autoSubtitles,
          soundLeveling: data.soundLeveling,
        },
        safetyContext: {
          isAdultVerified: userData?.ageVerified === true,
          contentType: 'AI_ENHANCED_VIDEO',
        },
      });

      return {
        requestId: result.requestId,
        status: result.status,
        outputUrl: result.outputUrl,
        safetyCheck: {
          passed: result.safetyCheck.result === 'PASS',
          reason: result.safetyCheck.reason,
        },
        metadata: {
          processingTime: result.metadata.processingTime,
          enhancements: result.enhancements,
        },
      };
    } catch (error: any) {
      console.error('Video enhancement endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// AUDIO ENHANCEMENT ENDPOINT
// ============================================================================

export const pack133_enhanceAudio = functions.https.onCall(
  async (data: EnhanceAudioRequest, context): Promise<EnhanceAudioResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const rateCheck = await checkRateLimit(userId, 'AUDIO');
      if (!rateCheck.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', rateCheck.reason!);
      }

      if (!data.mediaId || !data.inputUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }

      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      const result = await enhanceAudio({
        userId,
        mediaId: data.mediaId,
        inputUrl: data.inputUrl,
        enhancements: {
          noiseRemoval: data.noiseRemoval,
          eqLeveling: data.eqLeveling,
          fillerWordTrimming: data.fillerWordTrimming,
          transcription: data.transcription,
          translation: data.translation ? {
            targetLanguage: data.translation.targetLanguage,
            subtitlesOnly: true, // Always subtitles only, no voice replacement
          } : undefined,
        },
        safetyContext: {
          isAdultVerified: userData?.ageVerified === true,
          contentType: 'AI_ENHANCED_AUDIO',
        },
      });

      return {
        requestId: result.requestId,
        status: result.status,
        outputUrl: result.outputUrl,
        transcription: result.transcription,
        translation: result.translation,
        safetyCheck: {
          passed: result.safetyCheck.result === 'PASS',
          reason: result.safetyCheck.reason,
        },
        metadata: {
          processingTime: result.metadata.processingTime,
          enhancements: result.enhancements,
        },
      };
    } catch (error: any) {
      console.error('Audio enhancement endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// TEXT GENERATION ENDPOINTS
// ============================================================================

export const pack133_generateCaption = functions.https.onCall(
  async (data: GenerateCaptionRequest, context): Promise<GenerateCaptionResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const rateCheck = await checkRateLimit(userId, 'TEXT');
      if (!rateCheck.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', rateCheck.reason!);
      }

      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      const result = await generateText({
        userId,
        context: data.context,
        input: {
          mediaType: data.mediaType,
          mediaDescription: data.mediaDescription,
          text: data.existingText,
        },
        safetyContext: {
          isAdultVerified: userData?.ageVerified === true,
          contentType: 'AI_GENERATED_TEXT',
        },
      });

      return {
        requestId: result.requestId,
        suggestions: result.suggestions || [],
        safetyCheck: {
          passed: result.safetyCheck.result === 'PASS',
          reason: result.safetyCheck.reason,
        },
      };
    } catch (error: any) {
      console.error('Caption generation endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

export const pack133_translateText = functions.https.onCall(
  async (data: TranslateTextRequest, context): Promise<TranslateTextResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const rateCheck = await checkRateLimit(userId, 'TEXT');
      if (!rateCheck.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', rateCheck.reason!);
      }

      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      const result = await generateText({
        userId,
        context: 'TRANSLATION',
        input: {
          text: data.text,
          targetLanguage: data.targetLanguage,
        },
        safetyContext: {
          isAdultVerified: userData?.ageVerified === true,
          contentType: 'AI_TRANSLATED_TEXT',
        },
      });

      return {
        requestId: result.requestId,
        translatedText: result.generatedText || data.text,
        sourceLanguage: 'auto',
        targetLanguage: data.targetLanguage,
        safetyCheck: {
          passed: result.safetyCheck.result === 'PASS',
          reason: result.safetyCheck.reason,
        },
      };
    } catch (error: any) {
      console.error('Translation endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// DASHBOARD ENDPOINT
// ============================================================================

export const pack133_getAIStudioDashboard = functions.https.onCall(
  async (data: GetAIStudioDashboardRequest, context): Promise<GetAIStudioDashboardResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      // Aggregate stats
      const [imageCount, videoCount, audioCount, textCount] = await Promise.all([
        db.collection('ai_enhancement_requests')
          .where('userId', '==', userId)
          .where('mediaType', '==', 'IMAGE')
          .count()
          .get(),
        db.collection('ai_enhancement_requests')
          .where('userId', '==', userId)
          .where('mediaType', '==', 'VIDEO')
          .count()
          .get(),
        db.collection('ai_enhancement_requests')
          .where('userId', '==', userId)
          .where('mediaType', '==', 'AUDIO')
          .count()
          .get(),
        db.collection('ai_text_generations')
          .where('userId', '==', userId)
          .count()
          .get(),
      ]);

      // Get recent enhancements
      const recentSnapshot = await db
        .collection('ai_enhancement_requests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const recentEnhancements = recentSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          requestId: data.requestId,
          mediaType: data.mediaType,
          enhancements: data.enhancements || [],
          status: data.status,
          timestamp: data.createdAt,
        };
      });

      // Get safety record
      const safetySnapshot = await db
        .collection('ai_safety_audit_logs')
        .where('userId', '==', userId)
        .get();

      const totalChecks = safetySnapshot.size;
      const passed = safetySnapshot.docs.filter((doc) => doc.data().passed).length;
      const blocked = totalChecks - passed;
      const violations = safetySnapshot.docs
        .flatMap((doc) => doc.data().violations || [])
        .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);

      // Count AI badges enabled
      const badgesSnapshot = await db
        .collection('ai_proof_of_origin')
        .where('userId', '==', userId)
        .where('aiDisclosure.badgeEnabled', '==', true)
        .count()
        .get();

      const dashboard: AIStudioDashboard = {
        userId,
        stats: {
          totalEnhancements:
            imageCount.data().count +
            videoCount.data().count +
            audioCount.data().count +
            textCount.data().count,
          imageEnhancements: imageCount.data().count,
          videoEnhancements: videoCount.data().count,
          audioEnhancements: audioCount.data().count,
          textGenerated: textCount.data().count,
          processingTime: 0, // TODO: Calculate from records
          aiDisclosureBadgesEnabled: badgesSnapshot.data().count,
        },
        recentEnhancements,
        safetyRecord: {
          totalChecks,
          passed,
          blocked,
          violations,
        },
        lastUpdated: Timestamp.now(),
      };

      return { dashboard };
    } catch (error: any) {
      console.error('Dashboard endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// AI BADGE TOGGLE ENDPOINT
// ============================================================================

export const pack133_toggleAIBadge = functions.https.onCall(
  async (data: ToggleAIBadgeRequest, context): Promise<ToggleAIBadgeResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      if (!data.mediaId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing mediaId');
      }

      // Update badge status
      await db.collection('ai_proof_of_origin').doc(data.mediaId).update({
        'aiDisclosure.badgeEnabled': data.enabled,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        mediaId: data.mediaId,
        badgeEnabled: data.enabled,
      };
    } catch (error: any) {
      console.error('Toggle AI badge endpoint error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);