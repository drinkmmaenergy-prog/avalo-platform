"use client";

/**
 * AI Companions Service
 * Handles AI chat interfaces, history sync, and payments per media unlock
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AICompanion, AIConversation, AIMessage } from '../types';
import { AI_CHAT_CONFIG } from '../monetization';

// ============================================================================
// AI COMPANIONS
// ============================================================================

/**
 * Get available AI companions
 */
export async function getAvailableCompanions(): Promise<AICompanion[]> {
  try {
    const q = query(
      collection(requireDb(), 'ai_companions'),
      orderBy('tier'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as AICompanion[];
  } catch (error) {
    console.error('Error getting AI companions:', error);
    throw error;
  }
}

/**
 * Get specific AI companion
 */
export async function getCompanion(companionId: string): Promise<AICompanion | null> {
  try {
    const companionRef = doc(requireDb(), 'ai_companions', companionId);
    const companionSnap = await getDoc(companionRef);

    if (!companionSnap.exists()) {
      return null;
    }

    return {
      id: companionSnap.id,
      ...companionSnap.data(),
    } as AICompanion;
  } catch (error) {
    console.error('Error getting companion:', error);
    throw error;
  }
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

/**
 * Get or create conversation with AI companion
 */
export async function getOrCreateConversation(params: {
  userId: string;
  companionId: string;
}): Promise<{ conversationId: string; conversation: AIConversation }> {
  try {
    const getOrCreate = httpsCallable<typeof params, {
      conversationId: string;
      conversation: AIConversation;
    }>(requireFunctions(), 'getOrCreateAIConversation');
    
    const result = await getOrCreate(params);
    return result.data;
  } catch (error) {
    console.error('Error getting/creating conversation:', error);
    throw error;
  }
}

/**
 * Get user's conversations
 */
export async function getUserConversations(userId: string): Promise<AIConversation[]> {
  try {
    const q = query(
      collection(requireDb(), 'ai_conversations'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as AIConversation[];
  } catch (error) {
    console.error('Error getting user conversations:', error);
    throw error;
  }
}

/**
 * Subscribe to conversation updates
 */
export function subscribeToConversation(
  conversationId: string,
  callback: (conversation: AIConversation | null) => void
): Unsubscribe {
  const convRef = doc(requireDb(), 'ai_conversations', conversationId);
  
  return onSnapshot(convRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    
    callback({
      id: snapshot.id,
      ...snapshot.data(),
    } as AIConversation);
  });
}

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * Send message to AI companion
 * Backend handles token charging based on tier:
 * - Basic: 1 token/message
 * - Premium: 2 tokens/message
 * - NSFW: 4 tokens/message
 */
export async function sendAIMessage(params: {
  conversationId: string;
  userId: string;
  message: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  response?: string;
  tokenCost?: number;
  error?: string;
}> {
  try {
    const send = httpsCallable<typeof params, {
      success: boolean;
      messageId: string;
      response: string;
      tokenCost: number;
    }>(requireFunctions(), 'sendAIMessage');
    
    const result = await send(params);
    return result.data;
  } catch (error: any) {
    console.error('Error sending AI message:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message',
    };
  }
}

/**
 * Get message cost based on companion tier
 */
export function getMessageCost(tier: 'basic' | 'premium' | 'nsfw'): number {
  switch (tier) {
    case 'basic':
      return AI_CHAT_CONFIG.BASIC_MESSAGE_COST;
    case 'premium':
      return AI_CHAT_CONFIG.PREMIUM_MESSAGE_COST;
    case 'nsfw':
      return AI_CHAT_CONFIG.NSFW_MESSAGE_COST;
    default:
      return AI_CHAT_CONFIG.BASIC_MESSAGE_COST;
  }
}

// ============================================================================
// MEDIA UNLOCK
// ============================================================================

/**
 * Unlock AI-generated media content
 */
export async function unlockAIMedia(params: {
  conversationId: string;
  userId: string;
  mediaType: 'photo' | 'video';
}): Promise<{
  success: boolean;
  mediaUrl?: string;
  tokenCost?: number;
  error?: string;
}> {
  try {
    const unlock = httpsCallable<typeof params, {
      success: boolean;
      mediaUrl: string;
      tokenCost: number;
    }>(requireFunctions(), 'unlockAIMedia');
    
    const result = await unlock(params);
    return result.data;
  } catch (error: any) {
    console.error('Error unlocking AI media:', error);
    return {
      success: false,
      error: error.message || 'Failed to unlock media',
    };
  }
}

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

/**
 * Get subscription tier selector info
 */
export function getSubscriptionTiers(): Array<{
  tier: 'basic' | 'premium' | 'nsfw';
  name: string;
  costPerMessage: number;
  features: string[];
}> {
  return [
    {
      tier: 'basic',
      name: 'Basic',
      costPerMessage: AI_CHAT_CONFIG.BASIC_MESSAGE_COST,
      features: [
        'General conversations',
        'SFW content only',
        'Standard response time',
      ],
    },
    {
      tier: 'premium',
      name: 'Premium',
      costPerMessage: AI_CHAT_CONFIG.PREMIUM_MESSAGE_COST,
      features: [
        'Enhanced personality',
        'Faster responses',
        'Memory of past conversations',
        'Custom scenarios',
      ],
    },
    {
      tier: 'nsfw',
      name: 'NSFW',
      costPerMessage: AI_CHAT_CONFIG.NSFW_MESSAGE_COST,
      features: [
        'Adult content',
        'Unrestricted conversations',
        'Age verification required',
        'Private & encrypted',
      ],
    },
  ];
}
