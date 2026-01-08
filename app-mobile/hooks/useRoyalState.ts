/**
 * PACK 50 — Royal State Hook
 * React hook for managing Royal Club state in mobile app
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RoyalState,
  RoyalPreview,
  fetchRoyalState,
  refreshRoyalState,
  fetchRoyalPreview,
  refreshRoyalPreview,
  isRoyalTier,
  isHighRoyalTier,
} from '../services/royalService';

interface UseRoyalStateResult {
  state: RoyalState | null;
  preview: RoyalPreview | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  isRoyal: boolean;
  isHighRoyal: boolean;
}

/**
 * Hook to manage Royal Club state for current user
 */
export function useRoyalState(userId: string | null): UseRoyalStateResult {
  const [state, setState] = useState<RoyalState | null>(null);
  const [preview, setPreview] = useState<RoyalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load data on mount and when userId changes
  useEffect(() => {
    if (!userId) {
      setState(null);
      setPreview(null);
      setLoading(false);
      return;
    }

    loadData(userId);
  }, [userId]);

  const loadData = async (uid: string) => {
    try {
      setLoading(true);
      setError(null);

      // Try cache first
      const [cachedState, cachedPreview] = await Promise.all([
        fetchRoyalState(uid),
        fetchRoyalPreview(uid),
      ]);

      if (cachedState) setState(cachedState);
      if (cachedPreview) setPreview(cachedPreview);

      // Then refresh from backend
      const [freshState, freshPreview] = await Promise.all([
        refreshRoyalState(uid),
        refreshRoyalPreview(uid),
      ]);

      setState(freshState);
      setPreview(freshPreview);
    } catch (err) {
      console.error('[useRoyalState] Error loading data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!userId) return;
    await loadData(userId);
  }, [userId]);

  const isRoyal = state ? isRoyalTier(state.tier) : false;
  const isHighRoyal = state ? isHighRoyalTier(state.tier) : false;

  return {
    state,
    preview,
    loading,
    error,
    refresh,
    isRoyal,
    isHighRoyal,
  };
}

export default useRoyalState;