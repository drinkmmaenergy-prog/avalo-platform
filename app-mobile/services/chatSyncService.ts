/**
 * PACK 45 — Chat Sync Service
 * Mobile-side chat history sync with Firestore
 * Handles fetching, merging, and real-time updates
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { ChatMessage } from '../types/chat';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get deterministic conversation ID from two user IDs
 * Always returns the same ID regardless of parameter order
 */
function getConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_PREFIX = 'chat_messages_v1_';
const POLL_INTERVAL_MS = 12000; // 12 seconds polling fallback

// ============================================================================
// FETCH AND MERGE CONVERSATION HISTORY
// ============================================================================

/**
 * Fetch conversation history from backend and merge with local AsyncStorage
 * Preserves local unsynced messages
 */
export async function fetchAndMergeConversation(
  currentUserId: string,
  partnerId: string
): Promise<ChatMessage[]> {
  try {
    const conversationId = getConversationId(currentUserId, partnerId);
    
    // 1. Fetch from backend
    const getMessages = httpsCallable(functions, 'sync_getConversationMessages');
    const result = await getMessages({
      conversationId,
      limit: 100,
    });

    const response = result.data as any;
    if (!response.ok) {
      console.warn('[chatSyncService] Backend returned non-ok response');
      return await loadLocalMessages(conversationId);
    }

    const serverMessages = (response.messages || []) as any[];

    // 2. Load local messages
    const localMessages = await loadLocalMessages(conversationId);

    // 3. Merge: Server messages + local unsynced messages
    const mergedMessages = mergeMessages(serverMessages, localMessages, currentUserId);

    // 4. Save merged result back to AsyncStorage
    await saveLocalMessages(conversationId, mergedMessages);

    console.log(`[chatSyncService] Merged ${serverMessages.length} server + ${localMessages.length} local messages`);

    return mergedMessages;
  } catch (error) {
    console.error('[chatSyncService] Error fetching conversation:', error);
    // Fallback to local messages on error
    const conversationId = getConversationId(currentUserId, partnerId);
    return await loadLocalMessages(conversationId);
  }
}

/**
 * Merge server and local messages
 * - Server messages take precedence for synced messages
 * - Local unsynced messages are preserved
 * - Duplicates are removed based on message ID
 */
function mergeMessages(
  serverMessages: any[],
  localMessages: ChatMessage[],
  currentUserId: string
): ChatMessage[] {
  const messageMap = new Map<string, ChatMessage>();

  // First, add all server messages (they are authoritative)
  serverMessages.forEach((msg) => {
    const chatMessage: ChatMessage = {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      text: msg.text,
      createdAt: msg.createdAt,
      status: msg.status || 'synced',
      serverCreatedAt: msg.serverCreatedAt,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      isBoosted: msg.isBoosted,
      boostExtraTokens: msg.boostExtraTokens,
      mediaType: msg.mediaType,
      mediaUri: msg.mediaUri,
      payToUnlock: msg.payToUnlock,
      unlockPriceTokens: msg.unlockPriceTokens,
      unlockedBy: msg.unlockedBy,
      // PACK 47: Cloud Media Delivery
      mediaUploadStatus: msg.mediaUploadStatus,
      mediaStoragePath: msg.mediaStoragePath,
      mediaRemoteUrl: msg.mediaRemoteUrl,
    };
    messageMap.set(msg.id, chatMessage);
  });

  // Then, add local messages that aren't already in server (unsynced messages)
  localMessages.forEach((msg) => {
    if (!messageMap.has(msg.id)) {
      // This is a local-only message (not yet synced)
      messageMap.set(msg.id, { ...msg, status: msg.status || 'local' });
    } else {
      // Message exists on server - update local with server data
      const serverMsg = messageMap.get(msg.id)!;
      // Preserve local media URI if available
      if (msg.mediaUri && !serverMsg.mediaUri) {
        serverMsg.mediaUri = msg.mediaUri;
      }
      // PACK 47: Preserve local upload status if still uploading
      if (msg.mediaUploadStatus === 'uploading' && !serverMsg.mediaUploadStatus) {
        serverMsg.mediaUploadStatus = 'uploading';
      }
      // Use server's remote URL if available, otherwise keep local
      if (serverMsg.mediaRemoteUrl) {
        serverMsg.mediaUploadStatus = 'uploaded';
      }
    }
  });

  // Convert to array and sort by createdAt
  const merged = Array.from(messageMap.values()).sort((a, b) => a.createdAt - b.createdAt);

  return merged;
}

// ============================================================================
// REAL-TIME SUBSCRIPTION
// ============================================================================

let pollTimer: NodeJS.Timeout | null = null;
let currentConversationId: string | null = null;

/**
 * Subscribe to conversation updates (polling-based)
 * Returns unsubscribe function
 */
export function subscribeToConversation(
  currentUserId: string,
  partnerId: string,
  onMessages: (messages: ChatMessage[]) => void
): () => void {
  const conversationId = getConversationId(currentUserId, partnerId);
  currentConversationId = conversationId;

  // Clear any existing timer
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Initial fetch
  fetchAndMergeConversation(currentUserId, partnerId)
    .then(onMessages)
    .catch((error) => {
      console.error('[chatSyncService] Initial fetch error:', error);
    });

  // Poll for updates every 12 seconds
  pollTimer = setInterval(() => {
    if (currentConversationId === conversationId) {
      fetchAndMergeConversation(currentUserId, partnerId)
        .then(onMessages)
        .catch((error) => {
          console.error('[chatSyncService] Poll fetch error:', error);
        });
    }
  }, POLL_INTERVAL_MS);

  // Return unsubscribe function
  return () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    currentConversationId = null;
  };
}

// ============================================================================
// MARK MESSAGES AS DELIVERED
// ============================================================================

/**
 * Mark specific messages as delivered
 */
export async function markMessagesDelivered(
  currentUserId: string,
  partnerId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  try {
    const conversationId = getConversationId(currentUserId, partnerId);
    
    const markDelivered = httpsCallable(functions, 'sync_markMessagesDelivered');
    const result = await markDelivered({
      conversationId,
      messageIds,
    });

    const response = result.data as any;
    if (response.ok) {
      console.log(`[chatSyncService] Marked ${messageIds.length} messages as delivered`);
      
      // Update local messages
      const localMessages = await loadLocalMessages(conversationId);
      const updated = localMessages.map((msg) => {
        if (messageIds.includes(msg.id) && msg.receiverId === currentUserId) {
          return {
            ...msg,
            status: 'delivered' as const,
            deliveredAt: Date.now(),
          };
        }
        return msg;
      });
      await saveLocalMessages(conversationId, updated);
    }
  } catch (error) {
    console.error('[chatSyncService] Error marking messages delivered:', error);
    // Don't throw - failure to mark delivered shouldn't break the app
  }
}

// ============================================================================
// MARK CONVERSATION AS READ
// ============================================================================

/**
 * Mark entire conversation as read (all messages from partner)
 */
export async function markConversationRead(
  currentUserId: string,
  partnerId: string
): Promise<void> {
  try {
    const conversationId = getConversationId(currentUserId, partnerId);
    
    const markRead = httpsCallable(functions, 'sync_markConversationRead');
    const result = await markRead({
      conversationId,
    });

    const response = result.data as any;
    if (response.ok) {
      console.log(`[chatSyncService] Marked ${response.count || 0} messages as read`);
      
      // Update local messages
      const localMessages = await loadLocalMessages(conversationId);
      const updated = localMessages.map((msg) => {
        if (msg.receiverId === currentUserId && msg.senderId === partnerId) {
          return {
            ...msg,
            status: 'read' as const,
            readAt: Date.now(),
          };
        }
        return msg;
      });
      await saveLocalMessages(conversationId, updated);
    }
  } catch (error) {
    console.error('[chatSyncService] Error marking conversation read:', error);
    // Don't throw - failure to mark read shouldn't break the app
  }
}

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

/**
 * Load messages from AsyncStorage
 */
async function loadLocalMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${conversationId}`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[chatSyncService] Error loading local messages:', error);
    return [];
  }
}

/**
 * Save messages to AsyncStorage
 */
async function saveLocalMessages(
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${conversationId}`;
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error('[chatSyncService] Error saving local messages:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  fetchAndMergeConversation,
  subscribeToConversation,
  markMessagesDelivered,
  markConversationRead,
};