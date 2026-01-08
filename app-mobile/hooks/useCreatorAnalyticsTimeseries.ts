/**
 * PACK 82 — Creator Analytics Timeseries Hook
 * React hook for fetching and managing timeseries data for charts
 */

import { useState, useEffect, useCallback } from 'react';
import { getCreatorAnalyticsTimeseries } from '../services/analyticsService';
import {
  CreatorAnalyticsTimeseries,
  UseCreatorAnalyticsTimeseriesReturn,
  ANALYTICS_PERIODS,
} from '../types/analytics';

/**
 * Hook for fetching creator analytics timeseries
 * Provides daily data points for rendering charts
 */
export function useCreatorAnalyticsTimeseries(
  userId?: string,
  days: number = ANALYTICS_PERIODS.LAST_30_DAYS
): UseCreatorAnalyticsTimeseriesReturn {
  const [timeseries, setTimeseries] = useState<CreatorAnalyticsTimeseries | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTimeseries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await getCreatorAnalyticsTimeseries(userId, days);
      
      setTimeseries(data);
    } catch (err: any) {
      console.error('Error in useCreatorAnalyticsTimeseries:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch timeseries'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, days]);

  const refresh = useCallback(async () => {
    await fetchTimeseries();
  }, [fetchTimeseries]);

  // Initial fetch
  useEffect(() => {
    fetchTimeseries();
  }, [fetchTimeseries]);

  return {
    timeseries,
    isLoading,
    error,
    refresh,
  };
}