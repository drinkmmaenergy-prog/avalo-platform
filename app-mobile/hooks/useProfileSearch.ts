/**
 * PACK 94 — useProfileSearch Hook
 * React hook for managing profile search state
 */

import { useState, useCallback } from 'react';
import { discoveryService, DiscoveryFilters, ProfileCard } from '@/services/discoveryService';
import { getAuth } from 'firebase/auth';

interface UseProfileSearchResult {
  results: ProfileCard[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  search: (query: string, filters?: DiscoveryFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  clear: () => void;
}

/**
 * Hook to manage profile search
 */
export function useProfileSearch(limit: number = 20): UseProfileSearchResult {
  const auth = getAuth();
  const user = auth.currentUser;
  const [results, setResults] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const [currentFilters, setCurrentFilters] = useState<DiscoveryFilters | undefined>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  /**
   * Perform search
   */
  const search = useCallback(async (query: string, filters?: DiscoveryFilters) => {
    if (!user?.uid) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setCurrentQuery(query);
      setCurrentFilters(filters);
      setCursor(undefined);

      const response = await discoveryService.searchProfiles(
        user.uid,
        query,
        undefined,
        limit,
        filters
      );

      setResults(response.items);
      setCursor(response.cursor);
      setHasMore(response.hasMore);
    } catch (err: any) {
      console.error('[useProfileSearch] Error searching:', err);
      setError(err.message || 'Failed to search profiles');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, limit]);

  /**
   * Load more results
   */
  const loadMore = useCallback(async () => {
    if (!user?.uid || !hasMore || isLoadingMore || loading) {
      return;
    }

    try {
      setIsLoadingMore(true);
      setError(null);

      const response = await discoveryService.searchProfiles(
        user.uid,
        currentQuery,
        cursor,
        limit,
        currentFilters
      );

      setResults((prev) => [...prev, ...response.items]);
      setCursor(response.cursor);
      setHasMore(response.hasMore);
    } catch (err: any) {
      console.error('[useProfileSearch] Error loading more:', err);
      setError(err.message || 'Failed to load more results');
    } finally {
      setIsLoadingMore(false);
    }
  }, [user?.uid, hasMore, isLoadingMore, loading, currentQuery, cursor, limit, currentFilters]);

  /**
   * Clear search results
   */
  const clear = useCallback(() => {
    setResults([]);
    setCursor(undefined);
    setHasMore(false);
    setCurrentQuery('');
    setCurrentFilters(undefined);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    hasMore,
    search,
    loadMore,
    clear,
  };
}