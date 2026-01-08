/**
 * PACK 141 - AI Companion API Endpoints
 * Cloud Functions for AI Companion interactions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import {
  checkMessageSafety,
  getBlockedMessageResponse,
  findBlockedPhrase,
  checkConversationLimits,
  updateUsageTracking,
} from './pack141-safety-filter';
import {
  storeCompanionMemory,
  getCompanionMemories,
  getMemorySummaryForAI,
  extractMemoriesFromMessage,
  cleanupExpiredMemories,
  cleanupOldMemories,
} from './pack141-companion-memory';
import {
  chargeTokensForAIInteraction,
  checkSufficientBalance,
  getAICompanionPricing,
  startBillableSession,
  updateSessionBilling,
  endBillableSession,
} from './pack141-token-billing';
import {
  AICompanionProfile,
  SendAIMessageRequest,
  SendAIMessageResponse,
  StartAICallRequest,
  StartAICallResponse,
  GenerateAIMediaRequest,
  GenerateAIMediaResponse,
  AICompanionOnboarding,
  SAFE_PERSONALITY_CATEGORIES,
  FORBIDDEN_PERSONALITY_TYPES,
} from './types/pack141-types';

// ============================================================================
// AI COMPANION MESSAGING
// ============================================================================

/**
 * Send message to AI companion
 */
export const sendAICompanionMessage = onCall<SendAIMessageRequest, Promise<SendAIMessageResponse>>(
  { maxInstances: 100 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { companionId, messageText, sessionId } = request.data;

    // Validate inputs
    if (!companionId || !messageText) {
      throw new HttpsError('invalid-argument', 'companionId and messageText are required');
    }

    try {
      // Step 1: Check conversation limits (dependency prevention)
      const limitsCheck = await checkConversationLimits(userId, companionId);
      if (!limitsCheck.allowed) {
        throw new HttpsError('resource-exhausted', limitsCheck.reason || 'Conversation limit reached');
      }

      // Step 2: Check message safety
      const safetyCheck = await checkMessageSafety(userId, companionId, messageText);

      // If message blocked, return immediately with explanation
      if (safetyCheck.action === 'BLOCK' || safetyCheck.action === 'ESCALATE') {
        const blockedResponse = getBlockedMessageResponse(safetyCheck.detectedConcerns);
        
        return {
          sessionId: sessionId || 'blocked',
          messageId: safetyCheck.checkId,
          responseText: blockedResponse,
          tokensCharged: 0,
          safetyCheck: {
            passed: false,
            warnings: safetyCheck.detectedConcerns.map(c => c.toString()),
          },
          continueSession: false,
        };
      }

      // Step 3: Check sufficient balance
      const balanceCheck = await checkSufficientBalance(userId, 'TEXT', 1);
      if (!balanceCheck.sufficient) {
        throw new HttpsError('failed-precondition', `Insufficient balance. Need ${balanceCheck.shortfall} more tokens.`);
      }

      // Step 4: Get companion profile
      const companionDoc = await db.collection('ai_companion_profiles').doc(companionId).get();
      if (!companionDoc.exists) {
        throw new HttpsError('not-found', 'AI companion not found');
      }
      const companion = companionDoc.data() as AICompanionProfile;

      // Step 5: Get conversation context from memories
      const memorySummary = await getMemorySummaryForAI(userId, companionId);

      // Step 6: Generate AI response (placeholder - would integrate with actual AI service)
      const aiResponse = await generateAIResponse(messageText, companion, memorySummary);

      // Step 7: Charge tokens
      const billing = await chargeTokensForAIInteraction(userId, companionId, 'TEXT', 1);
      if (!billing.success) {
        throw new HttpsError('failed-precondition', billing.error || 'Failed to charge tokens');
      }

      // Step 8: Create or update session
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const newSession = await startBillableSession(userId, companionId, 'TEXT');
        currentSessionId = newSession.sessionId;
      }

      await updateSessionBilling(currentSessionId, billing.tokensCharged, 1);

      // Step 9: Extract and store memories from conversation
      await extractMemoriesFromMessage(userId, companionId, messageText, companion.category);

      // Step 10: Update usage tracking
      await updateUsageTracking(userId, companionId, 1);

      // Step 11: Return response
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        sessionId: currentSessionId,
        messageId,
        responseText: aiResponse,
        tokensCharged: billing.tokensCharged,
        safetyCheck: {
          passed: true,
          warnings: safetyCheck.riskLevel === 'LOW' ? safetyCheck.detectedConcerns.map(c => c.toString()) : [],
        },
        continueSession: true,
        cooldownRequired: false,
      };

    } catch (error: any) {
      console.error('Error in sendAICompanionMessage:', error);
      throw new HttpsError('internal', error.message || 'Internal server error');
    }
  }
);

/**
 * Generate AI response (placeholder for actual AI integration)
 */
async function generateAIResponse(
  userMessage: string,
  companion: AICompanionProfile,
  memorySummary: string
): Promise<string> {
  // This is a placeholder. In production, this would:
  // 1. Call GPT-4, Claude, or custom AI model
  // 2. Include system prompt with companion personality
  // 3. Include memory summary for context
  // 4. Apply strict safety filters on output
  
  const systemPrompt = `You are ${companion.name}, a ${companion.category} AI companion. ${companion.description}
  
Context from previous conversations:
${memorySummary}

STRICT RULES:
- NO romantic, flirtatious, or intimate responses
- NO NSFW content
- NO simulation of relationships
- Focus on helping user with their goals
- Be supportive, helpful, and appropriate`;

  // Placeholder response
  return `I hear you! As your ${companion.category} companion, I'm here to help you achieve your goals. Let's focus on what we can accomplish together today!`;
}

// ============================================================================
// VOICE/VIDEO CALLS
// ============================================================================

/**
 * Start voice or video call with AI companion
 */
export const startAICompanionCall = onCall<StartAICallRequest, Promise<StartAICallResponse>>(
  { maxInstances: 50 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { companionId, callType } = request.data;

    if (!companionId || !callType) {
      throw new HttpsError('invalid-argument', 'companionId and callType are required');
    }

    if (callType !== 'VOICE' && callType !== 'VIDEO') {
      throw new HttpsError('invalid-argument', 'callType must be VOICE or VIDEO');
    }

    try {
      // Check conversation limits
      const limitsCheck = await checkConversationLimits(userId, companionId);
      if (!limitsCheck.allowed) {
        throw new HttpsError('resource-exhausted', limitsCheck.reason || 'Conversation limit reached');
      }

      // Check sufficient balance for at least 1 minute
      const balanceCheck = await checkSufficientBalance(userId, callType, 1);
      if (!balanceCheck.sufficient) {
        throw new HttpsError('failed-precondition', `Insufficient balance. Need ${balanceCheck.shortfall} more tokens.`);
      }

      // Create session
      const session = await startBillableSession(userId, companionId, callType);

      // Get pricing
      const pricing = getAICompanionPricing()[callType];
      const tokensPerMinute = pricing.tokensPerMinute || 0;

      // Calculate max duration based on balance
      const maxDurationMinutes = Math.floor(balanceCheck.currentBalance / tokensPerMinute);

      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        sessionId: session.sessionId,
        callId,
        tokensPerMinute,
        maxDurationMinutes: Math.min(maxDurationMinutes, 120), // Cap at 2 hours
        safetyNotice: 'This call is for safe, appropriate interactions only. NSFW and romantic content is prohibited.',
      };

    } catch (error: any) {
      console.error('Error in startAICompanionCall:', error);
      throw new HttpsError('internal', error.message || 'Internal server error');
    }
  }
);

// ============================================================================
// MEDIA GENERATION
// ============================================================================

/**
 * Generate media with AI companion
 */
export const generateAICompanionMedia = onCall<GenerateAIMediaRequest, Promise<GenerateAIMediaResponse>>(
  { maxInstances: 50 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { companionId, generationType, prompt } = request.data;

    if (!companionId || !generationType || !prompt) {
      throw new HttpsError('invalid-argument', 'companionId, generationType, and prompt are required');
    }

    try {
      // Safety check on prompt
      const safetyCheck = await checkMessageSafety(userId, companionId, prompt);
      
      if (safetyCheck.action === 'BLOCK' || safetyCheck.action === 'ESCALATE') {
        return {
          generationId: safetyCheck.checkId,
          tokensCharged: 0,
          safetyCheck: {
            passed: false,
            blocked: true,
            reason: getBlockedMessageResponse(safetyCheck.detectedConcerns),
          },
        };
      }

      // Check sufficient balance
      const balanceCheck = await checkSufficientBalance(userId, 'MEDIA', 1);
      if (!balanceCheck.sufficient) {
        throw new HttpsError('failed-precondition', `Insufficient balance. Need ${balanceCheck.shortfall} more tokens.`);
      }

      // Charge tokens
      const billing = await chargeTokensForAIInteraction(userId, companionId, 'MEDIA', 1);
      if (!billing.success) {
        throw new HttpsError('failed-precondition', billing.error || 'Failed to charge tokens');
      }

      // Generate media (placeholder)
      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let mediaUrl: string | undefined;
      let caption: string | undefined;

      switch (generationType) {
        case 'IMAGE':
          mediaUrl = 'https://placeholder.com/safe-ai-generated-image.jpg';
          break;
        case 'CAPTION':
          caption = 'A motivating caption for your goals!';
          break;
        case 'AUDIO':
          mediaUrl = 'https://placeholder.com/safe-ai-generated-audio.mp3';
          break;
      }

      return {
        generationId,
        mediaUrl,
        caption,
        tokensCharged: billing.tokensCharged,
        safetyCheck: {
          passed: true,
          blocked: false,
        },
      };

    } catch (error: any) {
      console.error('Error in generateAICompanionMedia:', error);
      throw new HttpsError('internal', error.message || 'Internal server error');
    }
  }
);

// ============================================================================
// ONBOARDING
// ============================================================================

/**
 * Complete AI companion onboarding
 */
export const completeAICompanionOnboarding = onCall<Partial<AICompanionOnboarding>, Promise<{ success: boolean }>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const onboardingData = request.data;

    try {
      const onboarding: AICompanionOnboarding = {
        userId,
        selectedGoals: onboardingData.selectedGoals || [],
        communicationStyle: onboardingData.communicationStyle || 'DIRECT',
        notificationFrequency: onboardingData.notificationFrequency || 'MEDIUM',
        allowedCategories: onboardingData.allowedCategories || SAFE_PERSONALITY_CATEGORIES,
        disableEmotionalTopics: onboardingData.disableEmotionalTopics || false,
        disableVoiceMessages: onboardingData.disableVoiceMessages || false,
        disableAvatarImages: onboardingData.disableAvatarImages || false,
        onboardedAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };

      await db.collection('ai_companion_onboarding').doc(userId).set(onboarding);

      return { success: true };
    } catch (error: any) {
      console.error('Error in completeAICompanionOnboarding:', error);
      throw new HttpsError('internal', error.message || 'Internal server error');
    }
  }
);

/**
 * Get available AI companions
 */
export const getAICompanions = onCall<{ category?: string }, Promise<{ companions: AICompanionProfile[] }>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { category } = request.data;

    try {
      let query = db.collection('ai_companion_profiles')
        .where('isActive', '==', true)
        .where('safetyValidated', '==', true);

      if (category) {
        query = query.where('category', '==', category);
      }

      const snapshot = await query.limit(20).get();

      const companions: AICompanionProfile[] = [];
      snapshot.forEach(doc => {
        companions.push(doc.data() as AICompanionProfile);
      });

      return { companions };
    } catch (error: any) {
      console.error('Error in getAICompanions:', error);
      throw new HttpsError('internal', error.message || 'Internal server error');
    }
  }
);

/**
 * Get AI companion pricing
 */
export const getAICompanionPricingInfo = onCall(async () => {
  return { pricing: getAICompanionPricing() };
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily cleanup of expired memories and old data
 */
export const aiCompanionDailyCleanup = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'UTC' },
  async () => {
    console.log('Starting AI Companion daily cleanup...');

    try {
      // Cleanup expired memories
      const expiredCount = await cleanupExpiredMemories();
      console.log(`Cleaned up ${expiredCount} expired memories`);

      // Cleanup old low-importance memories
      const oldCount = await cleanupOldMemories();
      console.log(`Cleaned up ${oldCount} old memories`);

      console.log('AI Companion daily cleanup completed successfully');
    } catch (error) {
      console.error('Error in AI Companion daily cleanup:', error);
      throw error;
    }
  }
);