/**
 * useChatPricing Hook - PACK 39
 * React hook for managing dynamic chat message pricing
 * 
 * Responsibilities:
 * - Accept senderId and receiverId
 * - Build ChatPricingContext from local storage
 * - Fetch dependency values (heat score, responsiveness, etc.)
 * - Return ChatPricingResult with real-time price
 * - Provide refresh() function for price updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  calculateChatMessagePrice,
  buildPricingContext,
  updateLastReply,
  type ChatPricingResult,
  type ChatPricingContext,
} from '../services/chatPricingService';

interface UseChatPricingParams {
  senderId: string;
  receiverId: string;
  chatId: string;
  enabled?: boolean; // Allow disabling the hook
}

interface UseChatPricingReturn {
  tokenCost: number;
  breakdown: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  context: ChatPricingContext | null;
}

/**
 * Hook to calculate and manage dynamic chat message pricing
 * 
 * @param params - Sender, receiver, and chat identifiers
 * @returns Pricing information and refresh function
 * 
 * @example
 * const { tokenCost, refresh } = useChatPricing({
 *   senderId: currentUserId,
 *   receiverId: otherUserId,
 *   chatId: activeChatId,
 * });
 */
export function useChatPricing(params: UseChatPricingParams): UseChatPricingReturn {
  const { senderId, receiverId, chatId, enabled = true } = params;
  
  const [tokenCost, setTokenCost] = useState<number>(4); // Default base price
  const [breakdown, setBreakdown] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ChatPricingContext | null>(null);
  
  const mountedRef = useRef(true);
  const lastRefreshRef = useRef<number>(0);

  /**
   * Calculate current message price
   */
  const calculatePrice = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build context from local storage
      const pricingContext = await buildPricingContext(senderId, receiverId, chatId);
      
      // Calculate price
      const result: ChatPricingResult = await calculateChatMessagePrice(
        senderId,
        receiverId,
        chatId
      );

      if (mountedRef.current) {
        setContext(pricingContext);
        setTokenCost(result.tokenCost);
        setBreakdown(result.breakdown);
        lastRefreshRef.current = Date.now();
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to calculate price');
        // Fallback to base price on error
        setTokenCost(4);
        setBreakdown(['Error calculating price, using base: 4 tokens']);
      }
      
      if (__DEV__) {
        console.error('[useChatPricing] Error calculating price:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, senderId, receiverId, chatId]);

  /**
   * Refresh price calculation
   * Exposed to allow manual refresh when needed
   */
  const refresh = useCallback(async () => {
    await calculatePrice();
  }, [calculatePrice]);

  // Initial calculation on mount
  useEffect(() => {
    mountedRef.current = true;
    calculatePrice();

    return () => {
      mountedRef.current = false;
    };
  }, [calculatePrice]);

  // Recalculate when sender/receiver/chat changes
  useEffect(() => {
    if (enabled) {
      calculatePrice();
    }
  }, [senderId, receiverId, chatId, enabled, calculatePrice]);

  return {
    tokenCost,
    breakdown,
    loading,
    error,
    refresh,
    context,
  };
}

/**
 * Hook variant for simplified usage - just returns the current cost
 * 
 * @param params - Sender, receiver, and chat identifiers
 * @returns Current token cost
 */
export function useChatPrice(params: UseChatPricingParams): number {
  const { tokenCost } = useChatPricing(params);
  return tokenCost;
}

/**
 * Hook to update last reply timestamp when a message is received
 * Call this when the receiver sends a message back
 */
export function useUpdateLastReply(chatId: string) {
  const updateReply = useCallback(async () => {
    try {
      await updateLastReply(chatId);
    } catch (error) {
      if (__DEV__) {
        console.error('[useChatPricing] Error updating last reply:', error);
      }
    }
  }, [chatId]);

  return updateReply;
}

export default useChatPricing;