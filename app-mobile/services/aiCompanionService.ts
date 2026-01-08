/**
 * PACK 48 — AI Companion Service
 * Handles AI companion conversations with token-based billing
 * NO free messages, NO discounts
 * PACK 49 — Added personalization event recording
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { recordPersonalizationEvent } from './personalizationService'; // PACK 49

// ============================================================================
// TYPES
// ============================================================================

export interface AICompanion {
  companionId: string;
  displayName: string;
  avatarUrl: string;
  shortBio: string;
  personalityPreset: string;
  language: string;
  isNsfw: boolean;
  basePrompt: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AIConversation {
  conversationId: string;
  userId: string;
  companionId: string;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  companion?: {
    companionId: string;
    displayName: string;
    avatarUrl: string;
  };
}

export interface AIMessage {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: Timestamp;
  tokenCost: number;
  model: string;
  nsfwIncluded?: boolean;
}

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

const getFunctionsInstance = () => {
  try {
    const app = getApp();
    return getFunctions(app, 'europe-west3');
  } catch (error) {
    console.error('Error getting Functions instance:', error);
    throw error;
  }
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Start or get existing AI conversation
 */
export const startAIConversation = async (
  companionId: string
): Promise<{ conversationId: string }> => {
  try {
    const functions = getFunctionsInstance();
    const startConversationFn = httpsCallable<
      { companionId: string },
      { ok: boolean; conversationId?: string; error?: string }
    >(functions, 'ai_startConversation');

    const result = await startConversationFn({ companionId });

    if (!result.data.ok || !result.data.conversationId) {
      throw new Error(result.data.error || 'Failed to start conversation');
    }
    
    // PACK 49: Record companion selection event
    try {
      // Get current user ID from auth (assuming it's available)
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await recordPersonalizationEvent(currentUser.uid, 'COMPANION_SELECTED', {
          companionId,
        });
      }
    } catch (error) {
      console.debug('[PACK 49] Companion selection event recording failed (non-blocking)');
    }

    return { conversationId: result.data.conversationId };
  } catch (error: any) {
    console.error('[startAIConversation] Error:', error);
    throw error;
  }
};

/**
 * Send message to AI companion
 * Charges tokens per message
 */
export const sendAIMessage = async (
  conversationId: string,
  companionId: string,
  userMessage: string
): Promise<{
  userMessageId: string;
  aiMessageId: string;
  aiResponse: string;
  tokenCost: number;
}> => {
  try {
    const functions = getFunctionsInstance();
    const sendMessageFn = httpsCallable<
      {
        conversationId: string;
        companionId: string;
        userMessage: string;
      },
      {
        ok: boolean;
        userMessageId?: string;
        aiMessageId?: string;
        aiResponse?: string;
        tokenCost?: number;
        error?: string;
      }
    >(functions, 'ai_sendMessage');

    const result = await sendMessageFn({
      conversationId,
      companionId,
      userMessage,
    });

    if (!result.data.ok) {
      throw new Error(result.data.error || 'Failed to send message');
    }
    
    // PACK 49: Record AI message and token spent events
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await recordPersonalizationEvent(currentUser.uid, 'AI_MESSAGE', {
          companionId,
        });
        
        if (result.data.tokenCost && result.data.tokenCost > 0) {
          await recordPersonalizationEvent(currentUser.uid, 'TOKENS_SPENT', {
            tokensSpent: result.data.tokenCost,
          });
        }
      }
    } catch (error) {
      console.debug('[PACK 49] AI message event recording failed (non-blocking)');
    }

    return {
      userMessageId: result.data.userMessageId!,
      aiMessageId: result.data.aiMessageId!,
      aiResponse: result.data.aiResponse!,
      tokenCost: result.data.tokenCost!,
    };
  } catch (error: any) {
    console.error('[sendAIMessage] Error:', error);
    
    // Extract error message for insufficient tokens
    if (error.message?.includes('INSUFFICIENT_TOKENS')) {
      throw new Error('INSUFFICIENT_TOKENS');
    }
    
    throw error;
  }
};

/**
 * Get user's AI conversations
 */
export const getAIConversations = async (): Promise<AIConversation[]> => {
  try {
    const functions = getFunctionsInstance();
    const getConversationsFn = httpsCallable<
      {},
      { ok: boolean; conversations?: AIConversation[]; error?: string }
    >(functions, 'ai_getConversations');

    const result = await getConversationsFn({});

    if (!result.data.ok) {
      throw new Error(result.data.error || 'Failed to get conversations');
    }

    return result.data.conversations || [];
  } catch (error: any) {
    console.error('[getAIConversations] Error:', error);
    throw error;
  }
};

/**
 * Get messages from AI conversation
 */
export const getAIMessages = async (
  conversationId: string,
  limitCount: number = 50
): Promise<AIMessage[]> => {
  try {
    const functions = getFunctionsInstance();
    const getMessagesFn = httpsCallable<
      { conversationId: string; limit: number },
      { ok: boolean; messages?: AIMessage[]; error?: string }
    >(functions, 'ai_getMessages');

    const result = await getMessagesFn({ conversationId, limit: limitCount });

    if (!result.data.ok) {
      throw new Error(result.data.error || 'Failed to get messages');
    }

    return result.data.messages || [];
  } catch (error: any) {
    console.error('[getAIMessages] Error:', error);
    throw error;
  }
};

// ============================================================================
// REAL-TIME LISTENERS
// ============================================================================

/**
 * Subscribe to AI conversation messages in real-time
 */
export const subscribeToAIMessages = (
  conversationId: string,
  onUpdate: (messages: AIMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  try {
    const db = getDb();
    const messagesRef = collection(
      db,
      'ai_conversations',
      conversationId,
      'messages'
    );
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: AIMessage[] = snapshot.docs.map((doc) => ({
          messageId: doc.id,
          ...doc.data(),
        } as AIMessage));

        onUpdate(messages);
      },
      (error) => {
        console.error('[subscribeToAIMessages] Error:', error);
        if (onError) {
          onError(error);
        }
      }
    );
  } catch (error: any) {
    console.error('[subscribeToAIMessages] Setup error:', error);
    throw error;
  }
};

/**
 * Subscribe to user's AI conversations
 */
export const subscribeToAIConversations = (
  userId: string,
  onUpdate: (conversations: AIConversation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  try {
    const db = getDb();
    const conversationsRef = collection(db, 'ai_conversations');
    const q = query(
      conversationsRef,
      orderBy('lastMessageAt', 'desc'),
      limit(50)
    );

    return onSnapshot(
      q,
      async (snapshot) => {
        const conversations: AIConversation[] = [];

        for (const docSnap of snapshot.docs) {
          const conv = docSnap.data() as AIConversation;
          if (conv.userId === userId) {
            conversations.push({
              conversationId: docSnap.id,
              ...conv,
            });
          }
        }

        onUpdate(conversations);
      },
      (error) => {
        console.error('[subscribeToAIConversations] Error:', error);
        if (onError) {
          onError(error);
        }
      }
    );
  } catch (error: any) {
    console.error('[subscribeToAIConversations] Setup error:', error);
    throw error;
  }
};

/**
 * Get all AI companions (for list screen)
 */
export const getAllAICompanions = async (): Promise<AICompanion[]> => {
  try {
    const db = getDb();
    const companionsRef = collection(db, 'ai_companions');
    const snapshot = await getDocs(companionsRef);

    return snapshot.docs.map((doc) => ({
      companionId: doc.id,
      ...doc.data(),
    } as AICompanion));
  } catch (error: any) {
    console.error('[getAllAICompanions] Error:', error);
    throw error;
  }
};

// Import getDocs
import { getDocs } from 'firebase/firestore';