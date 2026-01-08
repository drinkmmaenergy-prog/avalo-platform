/**
 * PACK 81 — useEarningsLedger Hook
 * React hook for fetching and managing earnings ledger with pagination
 */

import { useState, useEffect, useCallback } from 'react';
import {
  LedgerPage,
  LedgerFilter,
  EarningsLedgerEntry,
} from '../types/earnings';
import { getEarningsLedger } from '../services/earningsService';

interface UseEarningsLedgerResult {
  entries: EarningsLedgerEntry[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: LedgerFilter) => void;
}

/**
 * Hook to fetch and manage earnings ledger with pagination
 */
export function useEarningsLedger(
  userId?: string,
  initialFilters?: LedgerFilter
): UseEarningsLedgerResult {
  const [entries, setEntries] = useState<EarningsLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [filters, setFilters] = useState<LedgerFilter>(initialFilters || {});

  const fetchInitialPage = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result: LedgerPage = await getEarningsLedger({
        userId,
        filters,
        limit: 20,
      });

      setEntries(result.entries);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setNextPageToken(result.nextPageToken);
    } catch (err) {
      console.error('Error fetching earnings ledger:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, filters]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !nextPageToken) return;

    try {
      setIsLoadingMore(true);
      setError(null);

      const result: LedgerPage = await getEarningsLedger({
        userId,
        filters,
        pageToken: nextPageToken,
        limit: 20,
      });

      setEntries((prev) => [...prev, ...result.entries]);
      setHasMore(result.hasMore);
      setNextPageToken(result.nextPageToken);
    } catch (err) {
      console.error('Error loading more entries:', err);
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, filters, hasMore, isLoadingMore, nextPageToken]);

  const refresh = useCallback(async () => {
    setNextPageToken(undefined);
    await fetchInitialPage();
  }, [fetchInitialPage]);

  const updateFilters = useCallback((newFilters: LedgerFilter) => {
    setFilters(newFilters);
    setNextPageToken(undefined);
  }, []);

  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  return {
    entries,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    setFilters: updateFilters,
  };
}