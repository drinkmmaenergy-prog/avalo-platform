/**
 * Chat Service with Token Engine
 * Implements 6/10 free messages (3 per participant), word-based billing, 65/35 split
 */

import { db, functions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Chat, ChatMessage } from '../types';
import { CHAT_CONFIG } from '../monetization';

// ============================================================================
// CHAT INITIALIZATION
// ============================================================================

/**
 * Initialize a new chat
 * Backend determines roles, mode, and billing via chatMonetization.ts
 */
export async function initializeChat(params: {
  userAId: string;
  userBId: string;
  initiatorId: string;
}): Promise<{ chatId: string; chat: Chat }> {
  try {
    const createChat = httpsCallable<typeof params, { chatId: string; chat: Chat }>(
      functions,
      'createChat'
    );
    const result = await createChat(params);
    return result.data;
  } catch (error) {
    console.error('Error initializing chat:', error);
    throw error;
  }
}

/**
 * Get chat by ID
 */
export async function getChat(chatId: string): Promise<Chat | null> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      return null;
    }

    return {
      id: chatSnap.id,
      ...chatSnap.data(),
    } as Chat;
  } catch (error) {
    console.error('Error getting chat:', error);
    throw error;
  }
}

/**
 * Get user's chats
 */
export async function getUserChats(userId: string): Promise<Chat[]> {
  try {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId),
      where('state', '!=', 'CLOSED'),
      orderBy('state'),
      orderBy('lastActivityAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Chat[];
  } catch (error) {
    console.error('Error getting user chats:', error);
    throw error;
  }
}

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * Send a message with billing
 * Backend handles:
 * - Free message deduction (3 per participant)
 * - Word counting (excluding URLs/emojis)
 * - Token billing for earner's words
 * - Escrow management
 * - Split application (65% escrow, 35% platform fee taken at deposit)
 */
export async function sendMessage(params: {
  chatId: string;
  senderId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video';
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const sendMsg = httpsCallable<typeof params, {
      success: boolean;
      messageId?: string;
      error?: string;
      tokensCost?: number;
    }>(functions, 'sendChatMessage');
    
    const result = await sendMsg(params);
    return result.data;
  } catch (error: any) {
    console.error('Error sending message:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message',
    };
  }
}

/**
 * Subscribe to chat messages
 */
export function subscribeToMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as ChatMessage[];
    callback(messages);
  });
}

/**
 * Subscribe to single chat
 */
export function subscribeToChat(
  chatId: string,
  callback: (chat: Chat | null) => void
): Unsubscribe {
  const chatRef = doc(db, 'chats', chatId);
  
  return onSnapshot(chatRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    
    callback({
      id: snapshot.id,
      ...snapshot.data(),
    } as Chat);
  });
}

// ============================================================================
// DEPOSITS & ESCROW
// ============================================================================

/**
 * Process chat deposit (100 tokens: 35% fee, 65% escrow)
 */
export async function processChatDeposit(params: {
  chatId: string;
  payerId: string;
}): Promise<{ success: boolean; escrowAmount?: number; platformFee?: number; error?: string }> {
  try {
    const deposit = httpsCallable<typeof params, {
      success: boolean;
      escrowAmount: number;
      platformFee: number;
    }>(functions, 'processChatDeposit');
    
    const result = await deposit(params);
    return result.data;
  } catch (error: any) {
    console.error('Error processing deposit:', error);
    return {
      success: false,
      error: error.message || 'Failed to process deposit',
    };
  }
}

/**
 * Get required deposit amount
 */
export function getDepositAmount(): {
  total: number;
  platformFee: number;
  escrow: number;
} {
  return {
    total: CHAT_CONFIG.CHAT_DEPOSIT_TOKENS,
    platformFee: Math.ceil(CHAT_CONFIG.CHAT_DEPOSIT_TOKENS * (CHAT_CONFIG.PLATFORM_FEE_PERCENT / 100)),
    escrow: Math.floor(CHAT_CONFIG.CHAT_DEPOSIT_TOKENS * (CHAT_CONFIG.ESCROW_PERCENT / 100)),
  };
}

// ============================================================================
// CHAT CLOSING
// ============================================================================

/**
 * Close and settle chat
 * Refunds unused escrow to payer
 */
export async function closeChat(params: {
  chatId: string;
  userId: string;
}): Promise<{ success: boolean; refunded?: number; error?: string }> {
  try {
    const close = httpsCallable<typeof params, {
      success: boolean;
      refunded: number;
    }>(functions, 'closeChat');
    
    const result = await close(params);
    return result.data;
  } catch (error: any) {
    console.error('Error closing chat:', error);
    return {
      success: false,
      error: error.message || 'Failed to close chat',
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate word count for message preview
 * Matches backend logic: excludes URLs and emojis
 */
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (basic ranges)
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Estimate token cost for a message
 */
export function estimateTokenCost(text: string, wordsPerToken: number = 11): number {
  const wordCount = countWords(text);
  return Math.round(wordCount / wordsPerToken);
}

/**
 * Get chat status info for UI
 */
export interface ChatStatusInfo {
  needsDeposit: boolean;
  freeMessagesRemaining: number;
  escrowBalance: number;
  mode: string;
  state: string;
}

export function getChatStatusInfo(chat: Chat, userId: string): ChatStatusInfo {
  return {
    needsDeposit: chat.state === 'AWAITING_DEPOSIT',
    freeMessagesRemaining: chat.billing.freeMessagesRemaining[userId] || 0,
    escrowBalance: chat.billing.escrowBalance || 0,
    mode: chat.mode,
    state: chat.state,
  };
}

/**
 * Format last activity time
 */
export function formatLastActivity(timestamp: Timestamp): string {
  const now = Date.now();
  const then = timestamp.toMillis();
  const diffMs = now - then;
  
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return timestamp.toDate().toLocaleDateString();
}