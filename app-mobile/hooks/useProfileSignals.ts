/**
 * useProfileSignals Hook - PACK 40
 * React hook for accessing profile signals data
 * 
 * Used for:
 * - Future settings UI
 * - Debug screens
 * - Profile analytics
 */

import { useState, useEffect } from 'react';
import { getProfileSignals, ProfileSignals } from '../services/profileRankService';

/**
 * Hook to get and refresh profile signals for a user
 * 
 * @param userId - User ID to get signals for
 * @returns Object containing signals, loading state, and refresh function
 */
export function useProfileSignals(userId: string) {
  const [signals, setSignals] = useState<ProfileSignals | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getProfileSignals(userId);
      setSignals(data);
    } catch (error) {
      if (__DEV__) {
        console.error('[useProfileSignals] Error loading signals:', error);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userId) {
      refresh();
    }
  }, [userId]);

  return { signals, loading, refresh };
}

export default useProfileSignals;