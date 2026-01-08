/**
 * PACK 256: AI Reply Accelerator - Callable Functions
 * HTTP callable functions for AI suggestion generation
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init.js';
import {
  generateReplySuggestions,
  shouldShowSuggestions,
  trackSuggestionAction,
  type SuggestionTone,
  type SuggestionContext,
  type SuggestionTrigger,
} from './pack256AiReplySuggestions.js';

// ============================================================================
// CALLABLE: Generate Reply Suggestions
// ============================================================================

export const generateAiReplySuggestions = onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const { chatId, tone, trigger = 'manual_request' } = request.data;

    if (!chatId || !tone) {
      throw new HttpsError(
        'invalid-argument',
        'chatId and tone are required'
      );
    }

    const validTones: SuggestionTone[] = ['flirty', 'sweet', 'confident', 'elegant', 'savage', 'nsfw'];
    if (!validTones.includes(tone)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid tone. Must be one of: ${validTones.join(', ')}`
      );
    }

    try {
      // Verify user is participant in chat
      const chatSnap = await db.collection('chats').doc(chatId).get();
      if (!chatSnap.exists) {
        throw new HttpsError('not-found', 'Chat not found');
      }

      const chat = chatSnap.data() as any;
      if (!chat.participants.includes(userId)) {
        throw new HttpsError('permission-denied', 'Not a participant in this chat');
      }

      // Get conversation history
      const messagesSnap = await db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const conversationHistory = messagesSnap.docs.map(doc => {
        const data = doc.data();
        return {
          senderId: data.senderId,
          text: data.text || '',
          sentAt: data.createdAt?.toDate?.() || new Date(),
        };
      }).reverse();

      // Get last message
      const lastMessage = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : undefined;

      // Build context
      const context: SuggestionContext = {
        chatId,
        userId,
        lastMessage,
        conversationHistory,
        chatMode: chat.mode || 'PAID',
        chatState: chat.state || 'FREE_ACTIVE',
        isPaidChat: chat.mode === 'PAID',
        participantGenders: {}, // Would be populated from user profiles
        trigger: trigger as SuggestionTrigger,
      };

      // Generate suggestions
      const result = await generateReplySuggestions(context, tone as SuggestionTone);

      return {
        ok: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Error generating AI suggestions:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        ok: false,
        error: error.message || 'Failed to generate suggestions',
      };
    }
  }
);

// ============================================================================
// CALLABLE: Check if Suggestions Should Show
// ============================================================================

export const checkSuggestionTriggers = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const { chatId } = request.data;

    if (!chatId) {
      throw new HttpsError('invalid-argument', 'chatId is required');
    }

    try {
      // Verify user is participant
      const chatSnap = await db.collection('chats').doc(chatId).get();
      if (!chatSnap.exists) {
        throw new HttpsError('not-found', 'Chat not found');
      }

      const chat = chatSnap.data() as any;
      if (!chat.participants.includes(userId)) {
        throw new HttpsError('permission-denied', 'Not a participant in this chat');
      }

      const result = await shouldShowSuggestions(chatId, userId);

      return {
        ok: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Error checking suggestion triggers:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        ok: false,
        error: error.message || 'Failed to check triggers',
      };
    }
  }
);

// ============================================================================
// CALLABLE: Track Suggestion Action
// ============================================================================

export const trackAiSuggestionAction = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const { sessionId, action, editedText } = request.data;

    if (!sessionId || !action) {
      throw new HttpsError(
        'invalid-argument',
        'sessionId and action are required'
      );
    }

    const validActions = ['accepted', 'edited', 'ignored'];
    if (!validActions.includes(action)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid action. Must be one of: ${validActions.join(', ')}`
      );
    }

    try {
      // Verify session belongs to user
      const sessionSnap = await db
        .collection('ai_suggestion_sessions')
        .doc(sessionId)
        .get();

      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', 'Session not found');
      }

      const session = sessionSnap.data();
      if (session?.userId !== userId) {
        throw new HttpsError('permission-denied', 'Session does not belong to user');
      }

      await trackSuggestionAction(sessionId, action, editedText);

      return {
        ok: true,
        data: { tracked: true },
      };
    } catch (error: any) {
      console.error('Error tracking suggestion action:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        ok: false,
        error: error.message || 'Failed to track action',
      };
    }
  }
);

// ============================================================================
// CALLABLE: Update User Preferences
// ============================================================================

export const updateAiSuggestionPreferences = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const { enabled, defaultTone, nsfwConsent } = request.data;

    try {
      const updates: any = {
        updatedAt: new Date(),
      };

      if (typeof enabled === 'boolean') {
        updates.enabled = enabled;
      }

      if (defaultTone) {
        const validTones = ['flirty', 'sweet', 'confident', 'elegant', 'savage', 'nsfw'];
        if (!validTones.includes(defaultTone)) {
          throw new HttpsError(
            'invalid-argument',
            `Invalid tone. Must be one of: ${validTones.join(', ')}`
          );
        }
        updates.defaultTone = defaultTone;
      }

      if (typeof nsfwConsent === 'boolean') {
        updates.nsfwConsent = nsfwConsent;
      }

      await db
        .collection('users')
        .doc(userId)
        .collection('ai_preferences')
        .doc('chat_suggestions')
        .set(updates, { merge: true });

      return {
        ok: true,
        data: { updated: true },
      };
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return {
        ok: false,
        error: error.message || 'Failed to update preferences',
      };
    }
  }
);

// ============================================================================
// CALLABLE: Get User Analytics
// ============================================================================

export const getAiSuggestionAnalytics = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const analyticsSnap = await db
        .collection('ai_suggestion_analytics')
        .doc(userId)
        .get();

      if (!analyticsSnap.exists) {
        return {
          ok: true,
          data: {
            totalGenerated: 0,
            totalAccepted: 0,
            acceptanceRate: 0,
            byTone: {},
            byTrigger: {},
            actionsByType: {},
          },
        };
      }

      const analytics = analyticsSnap.data();

      // Calculate acceptance rate
      const totalGenerated = analytics?.totalGenerated || 0;
      const totalAccepted = analytics?.totalAccepted || 0;
      const acceptanceRate = totalGenerated > 0
        ? (totalAccepted / totalGenerated) * 100
        : 0;

      return {
        ok: true,
        data: {
          totalGenerated,
          totalAccepted,
          acceptanceRate: Math.round(acceptanceRate * 100) / 100,
          byTone: analytics?.byTone || {},
          byTrigger: analytics?.byTrigger || {},
          actionsByType: analytics?.actionsByType || {},
          actionsByTone: analytics?.actionsByTone || {},
        },
      };
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      
      return {
        ok: false,
        error: error.message || 'Failed to fetch analytics',
      };
    }
  }
);