/**
 * Chat Media Service - PACK 42
 * Handles paid media messages in chat (AsyncStorage only)
 *
 * HARD CONSTRAINTS:
 * - Local data only (AsyncStorage)
 * - No backend, no Firestore, no Functions
 * - No uploads, no external storage
 * - Local-first architecture
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from '../types/chat';
import { spendTokensForMessage } from './tokenService';
import { syncMediaUnlock, syncTokenSpent } from './backSyncService';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  CHAT_MESSAGES: 'chat_messages_v1_',
  MEDIA_UNLOCKS: 'media_unlocks_v1_',
} as const;

// ============================================================================
// UNLOCK MEDIA
// ============================================================================

/**
 * Unlock paid media message for current user
 * Deducts tokens and adds user to unlockedBy list
 */
export async function unlockMedia(
  chatId: string,
  messageId: string,
  userId: string,
  unlockPrice: number
): Promise<void> {
  try {
    // 1. Spend tokens
    await spendTokensForMessage(userId, unlockPrice);
    
    // 2. Load messages
    const key = `${STORAGE_KEYS.CHAT_MESSAGES}${chatId}`;
    const data = await AsyncStorage.getItem(key);
    const messages: ChatMessage[] = data ? JSON.parse(data) : [];
    
    // 3. Find and update message
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error('Message not found');
    }
    
    const message = messages[messageIndex];
    const unlockedBy = message.unlockedBy || [];
    
    // Check if already unlocked
    if (unlockedBy.includes(userId)) {
      if (__DEV__) {
        console.log('[ChatMedia] Already unlocked:', messageId);
      }
      return;
    }
    
    // Add user to unlockedBy list
    messages[messageIndex] = {
      ...message,
      unlockedBy: [...unlockedBy, userId],
    };
    
    // 4. Save updated messages
    await AsyncStorage.setItem(key, JSON.stringify(messages));
    
    // 5. Store unlock record
    const unlockKey = `${STORAGE_KEYS.MEDIA_UNLOCKS}${userId}_${messageId}`;
    await AsyncStorage.setItem(
      unlockKey,
      JSON.stringify({
        userId,
        messageId,
        chatId,
        unlockedAt: Date.now(),
        price: unlockPrice,
      })
    );
    
    if (__DEV__) {
      console.log('[ChatMedia] Media unlocked:', {
        messageId,
        userId,
        price: unlockPrice,
      });
    }
    
    // PACK 44: Backend sync - media unlock (AFTER local success)
    try {
      await syncMediaUnlock(messageId, userId, unlockPrice);
    } catch (error) {
      console.error('[PACK 44] Error syncing media unlock to backend:', error);
      // Don't throw - backend sync failure shouldn't break media unlock
    }
    
    // PACK 44: Backend sync - token spent (AFTER local success)
    try {
      await syncTokenSpent(userId, unlockPrice, 'media_unlock');
    } catch (error) {
      console.error('[PACK 44] Error syncing token spent to backend:', error);
      // Don't throw - backend sync failure shouldn't break media unlock
    }
  } catch (error) {
    if (__DEV__) {
      console.error('[ChatMedia] Error unlocking media:', error);
    }
    throw error;
  }
}

/**
 * Check if user has unlocked a media message
 */
export async function isMediaUnlocked(
  messageId: string,
  userId: string
): Promise<boolean> {
  try {
    const unlockKey = `${STORAGE_KEYS.MEDIA_UNLOCKS}${userId}_${messageId}`;
    const data = await AsyncStorage.getItem(unlockKey);
    return data !== null;
  } catch (error) {
    if (__DEV__) {
      console.error('[ChatMedia] Error checking unlock status:', error);
    }
    return false;
  }
}

/**
 * Get all messages for a chat
 */
export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  try {
    const key = `${STORAGE_KEYS.CHAT_MESSAGES}${chatId}`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    if (__DEV__) {
      console.error('[ChatMedia] Error getting messages:', error);
    }
    return [];
  }
}

/**
 * Save message to chat
 */
export async function saveChatMessage(
  chatId: string,
  message: ChatMessage
): Promise<void> {
  try {
    const messages = await getChatMessages(chatId);
    messages.push(message);
    
    const key = `${STORAGE_KEYS.CHAT_MESSAGES}${chatId}`;
    await AsyncStorage.setItem(key, JSON.stringify(messages));
    
    if (__DEV__) {
      console.log('[ChatMedia] Message saved:', {
        chatId,
        messageId: message.id,
        hasMedia: !!message.mediaType,
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.error('[ChatMedia] Error saving message:', error);
    }
    throw error;
  }
}

/**
 * Create media message
 */
export function createMediaMessage(
  senderId: string,
  receiverId: string,
  mediaType: 'photo' | 'audio' | 'video',
  mediaUri: string,
  unlockPrice: number,
  text: string = ''
): ChatMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    senderId,
    receiverId,
    text: text || `[${mediaType}]`,
    createdAt: Date.now(),
    mediaType,
    mediaUri,
    payToUnlock: true,
    unlockPriceTokens: unlockPrice,
    unlockedBy: [],
    status: 'local', // PACK 45: Default status for new messages
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  unlockMedia,
  isMediaUnlocked,
  getChatMessages,
  saveChatMessage,
  createMediaMessage,
};