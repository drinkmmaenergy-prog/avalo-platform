/**
 * Swipe Bridge Service
 * PACK 36: Swipe Action Bridge
 * Purpose: Expose method performRightSwipe(profileId) that programmatically triggers a right swipe
 * No UI changes inside SwipeDeck - uses existing swipe system
 * Must not break swipe counter system
 */

import { recordLike } from './interactionService';

/**
 * Programmatically perform a right swipe (like) on a profile
 * This bridges the Smart Suggestions feature with the existing swipe system
 * 
 * @param userId - Current user's ID
 * @param profileId - Target profile to like
 * @returns Promise with match result
 */
export async function performRightSwipe(
  userId: string,
  profileId: string
): Promise<{ matchCreated: boolean; chatId?: string; matchId?: string }> {
  try {
    // Use existing recordLike from interactionService
    // This ensures all swipe logic, counters, and match detection work correctly
    const result = await recordLike(userId, profileId, false);
    
    return {
      matchCreated: result.matchCreated,
      chatId: result.chatId,
      matchId: result.matchId,
    };
  } catch (error) {
    console.error('[SwipeBridge] Error performing right swipe:', error);
    throw error;
  }
}

/**
 * Optional: Event emitter for swipe callbacks (future enhancement)
 * This can be used if we need to notify SwipeDeck about programmatic swipes
 * For MVP, direct API calls are sufficient
 */
export type SwipeEventCallback = (profileId: string, action: 'like' | 'skip') => void;

let swipeEventCallbacks: SwipeEventCallback[] = [];

export function registerSwipeCallback(callback: SwipeEventCallback): () => void {
  swipeEventCallbacks.push(callback);
  
  // Return unsubscribe function
  return () => {
    swipeEventCallbacks = swipeEventCallbacks.filter(cb => cb !== callback);
  };
}

export function emitSwipeEvent(profileId: string, action: 'like' | 'skip'): void {
  swipeEventCallbacks.forEach(callback => {
    try {
      callback(profileId, action);
    } catch (error) {
      console.error('[SwipeBridge] Error in swipe callback:', error);
    }
  });
}