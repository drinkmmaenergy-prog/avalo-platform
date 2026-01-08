/**
 * PACK 344 — Anti Copy-Paste Guard
 * Client-side detection and warning for repeated messages
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'pack344_message_hashes';
const MAX_CACHE_SIZE = 50;

interface MessageHashCache {
  hash: string;
  chatId: string;
  timestamp: number;
}

/**
 * Simple hash function (FNV-1a)
 */
function simpleHash(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate a normalized hash for a message
 */
export function hashMessage(text: string): string {
  // Normalize text: lowercase, remove extra spaces, trim
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  // Generate hash
  return simpleHash(normalized);
}

/**
 * Check if message is a potential spam (client-side)
 * Returns true if same message sent to multiple recipients recently
 */
export async function checkForSpamPattern(
  messageText: string,
  chatId: string
): Promise<{ isSpamLike: boolean; recipientsCount: number }> {
  try {
    const messageHash = hashMessage(messageText);

    // Get local cache
    const cacheJson = await AsyncStorage.getItem(CACHE_KEY);
    const cache: MessageHashCache[] = cacheJson ? JSON.parse(cacheJson) : [];

    // Find messages with same hash in last 15 minutes
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const recentSameMessages = cache.filter(
      (item) => item.hash === messageHash && item.timestamp > fifteenMinutesAgo
    );

    // Count unique chat IDs
    const uniqueChatIds = new Set(recentSameMessages.map((m) => m.chatId));
    const isSpamLike = uniqueChatIds.size >= 4; // 4+ different chats = spam-like

    // Add current message to cache
    cache.push({
      hash: messageHash,
      chatId,
      timestamp: Date.now(),
    });

    // Trim cache to max size (keep most recent)
    const trimmedCache = cache
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_CACHE_SIZE);

    // Save back to storage
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmedCache));

    return {
      isSpamLike,
      recipientsCount: uniqueChatIds.size + 1, // +1 for current
    };
  } catch (error) {
    console.error('[PACK 344] Error checking spam pattern:', error);
    return { isSpamLike: false, recipientsCount: 0 };
  }
}

/**
 * Report spam pattern to backend (optional enhancement)
 */
export async function reportSpamPattern(
  messageHash: string,
  chatId: string
): Promise<{ isSpamLike: boolean; recipientsCount: number; threshold: number }> {
  try {
    const functions = getFunctions();
    const flagPattern = httpsCallable(functions, 'pack344_flagRepeatedMessagePattern');

    const result = await flagPattern({
      messageHash,
      chatId,
    });

    return result.data as any;
  } catch (error) {
    console.error('[PACK 344] Error reporting spam pattern:', error);
    throw error;
  }
}

/**
 * Clear message hash cache
 */
export async function clearMessageHashCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('[PACK 344] Error clearing cache:', error);
  }
}
