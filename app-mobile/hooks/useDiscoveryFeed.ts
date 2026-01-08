/**
 * PACK 94 — useDiscoveryFeed Hook
 * React hook for managing discovery feed state
 */

import { useState, useEffect, useCallback } from 'react';
import { discoveryService, DiscoveryFilters, ProfileCard } from '@/services/discoveryService';
import { getAuth } from 'firebase/auth';

interface UseDiscoveryFeedResult {
  items: ProfileCard[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: DiscoveryFilters) => void;
}

/**
 * Hook to manage discovery feed
 */
export function useDiscoveryFeed(
  initialFilters?: DiscoveryFilters,
  limit: number = 20
): UseDiscoveryFeedResult {
  const auth = getAuth();
  const user = auth.currentUser;
  const [items, setItems] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState<DiscoveryFilters | undefined>(initialFilters);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  /**
   * Load initial feed
   */
  const loadFeed = useCallback(async (resetCursor: boolean = false) => {
    if (!user?.uid) {
      return;
    }

    try {
      setError(null);
      if (resetCursor) {
        setLoading(true);
        setCursor(undefined);
      }

      const response = await discoveryService.getDiscoveryFeed(
        user.uid,
        resetCursor ? undefined : cursor,
        limit,
        filters
      );

      if (resetCursor) {
        setItems(response.items);
      } else {
        setItems((prev) => [...prev, ...response.items]);
      }

      setCursor(response.cursor);
      setHasMore(response.hasMore);
    } catch (err: any) {
      console.error('[useDiscoveryFeed] Error loading feed:', err);
      setError(err.message || 'Failed to load discovery feed');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [user?.uid, cursor, limit, filters]);

  /**
   * Load more items
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || loading) {
      return;
    }

    setIsLoadingMore(true);
    await loadFeed(false);
  }, [hasMore, isLoadingMore, loading, loadFeed]);

  /**
   * Refresh feed
   */
  const refresh = useCallback(async () => {
    await loadFeed(true);
  }, [loadFeed]);

  /**
   * Update filters and reload
   */
  const updateFilters = useCallback((newFilters: DiscoveryFilters) => {
    setFilters(newFilters);
    setCursor(undefined);
  }, []);

  // Load initial feed
  useEffect(() => {
    if (user?.uid) {
      loadFeed(true);
    }
  }, [user?.uid, filters]); // Reload when user or filters change

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    setFilters: updateFilters,
  };
}