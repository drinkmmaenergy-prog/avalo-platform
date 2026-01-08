/**
 * Creator Analytics Hooks
 * PACK 97 — React hooks for creator analytics and earnings insights
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getCreatorEarningsSummary,
  getCreatorEarningsTimeseries,
  getTopPerformingContent,
  getLastNDaysRange,
  CreatorEarningsSummary,
  EarningsTimeseries,
  TopContentResult,
} from '../services/creatorAnalyticsService';

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook: useCreatorEarningsSummary
 * Fetches and manages creator earnings summary state
 */
export function useCreatorEarningsSummary(userId?: string) {
  const [data, setData] = useState<CreatorEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const summary = await getCreatorEarningsSummary(userId);
      setData(summary);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching earnings summary:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    data,
    loading,
    error,
    refetch: fetchSummary,
  };
}

/**
 * Hook: useCreatorEarningsTimeseries
 * Fetches and manages earnings timeseries data for charts
 */
export function useCreatorEarningsTimeseries(
  range: { from: Date; to: Date } | number = 30,
  userId?: string
) {
  const [data, setData] = useState<EarningsTimeseries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTimeseries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // If range is a number, convert to date range
      const dateRange =
        typeof range === 'number' ? getLastNDaysRange(range) : range;

      const timeseries = await getCreatorEarningsTimeseries(
        dateRange.from,
        dateRange.to,
        userId
      );
      setData(timeseries);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching earnings timeseries:', err);
    } finally {
      setLoading(false);
    }
  }, [range, userId]);

  useEffect(() => {
    fetchTimeseries();
  }, [fetchTimeseries]);

  return {
    data,
    loading,
    error,
    refetch: fetchTimeseries,
  };
}

/**
 * Hook: useTopPerformingContent
 * Fetches and manages top performing content data
 */
export function useTopPerformingContent(
  range: { from: Date; to: Date } | number = 30,
  limit: number = 10,
  userId?: string
) {
  const [data, setData] = useState<TopContentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTopContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // If range is a number, convert to date range
      const dateRange =
        typeof range === 'number' ? getLastNDaysRange(range) : range;

      const topContent = await getTopPerformingContent(
        dateRange.from,
        dateRange.to,
        limit,
        userId
      );
      setData(topContent);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching top performing content:', err);
    } finally {
      setLoading(false);
    }
  }, [range, limit, userId]);

  useEffect(() => {
    fetchTopContent();
  }, [fetchTopContent]);

  return {
    data,
    loading,
    error,
    refetch: fetchTopContent,
  };
}

/**
 * Hook: useCreatorAnalyticsState
 * Combined hook that manages all analytics states with a single timeframe selector
 */
export function useCreatorAnalyticsState(userId?: string) {
  const [timeframe, setTimeframe] = useState<7 | 30 | 90>(30);

  const summary = useCreatorEarningsSummary(userId);
  const timeseries = useCreatorEarningsTimeseries(timeframe, userId);
  const topContent = useTopPerformingContent(timeframe, 10, userId);

  const refetchAll = useCallback(() => {
    summary.refetch();
    timeseries.refetch();
    topContent.refetch();
  }, [summary, timeseries, topContent]);

  const loading = summary.loading || timeseries.loading || topContent.loading;
  const error = summary.error || timeseries.error || topContent.error;

  return {
    timeframe,
    setTimeframe,
    summary: summary.data,
    timeseries: timeseries.data,
    topContent: topContent.data,
    loading,
    error,
    refetchAll,
  };
}

/**
 * Hook: useEarningsGrowth
 * Calculates earnings growth metrics from timeseries data
 */
export function useEarningsGrowth(timeseries: EarningsTimeseries | null) {
  const [growth, setGrowth] = useState<{
    current: number;
    previous: number;
    percentageChange: number;
    trend: 'up' | 'down' | 'neutral';
  } | null>(null);

  useEffect(() => {
    if (!timeseries || timeseries.points.length === 0) {
      setGrowth(null);
      return;
    }

    const points = timeseries.points;
    const midpoint = Math.floor(points.length / 2);

    // Calculate earnings for first half and second half
    const firstHalf = points.slice(0, midpoint);
    const secondHalf = points.slice(midpoint);

    const previousTotal = firstHalf.reduce(
      (sum, point) => sum + point.tokensEarnedTotal,
      0
    );
    const currentTotal = secondHalf.reduce(
      (sum, point) => sum + point.tokensEarnedTotal,
      0
    );

    let percentageChange = 0;
    if (previousTotal > 0) {
      percentageChange = ((currentTotal - previousTotal) / previousTotal) * 100;
    } else if (currentTotal > 0) {
      percentageChange = 100;
    }

    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (percentageChange > 5) {
      trend = 'up';
    } else if (percentageChange < -5) {
      trend = 'down';
    }

    setGrowth({
      current: currentTotal,
      previous: previousTotal,
      percentageChange,
      trend,
    });
  }, [timeseries]);

  return growth;
}