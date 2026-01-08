/**
 * PACK 43 — useChatStreak Hook
 * 
 * React hook for accessing and managing chat streak data in UI
 */

import { useState, useEffect, useMemo } from 'react';
import {
  getStreakForPair,
  getStreakSummary,
  ChatStreak,
  ChatStreakSummary,
} from '../services/loyalStreakService';

/**
 * Hook to get and manage chat streak data for a user pair
 */
export function useChatStreak(userId: string, partnerId: string) {
  const [streak, setStreak] = useState<ChatStreak | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Refresh streak data from storage
   */
  async function refresh() {
    setLoading(true);
    try {
      const data = await getStreakForPair(userId, partnerId);
      setStreak(data);
    } catch (error) {
      console.error('[useChatStreak] Error refreshing streak:', error);
      setStreak(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Initial load on mount or when userId/partnerId changes
   */
  useEffect(() => {
    if (userId && partnerId) {
      refresh();
    }
  }, [userId, partnerId]);

  /**
   * Compute streak summary for UI display
   */
  const summary: ChatStreakSummary | null = useMemo(() => {
    return getStreakSummary(streak);
  }, [streak]);

  return {
    streak,
    summary,
    loading,
    refresh,
  };
}

export default useChatStreak;