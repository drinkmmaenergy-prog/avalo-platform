/**
 * PACK 257 — Creator Dashboard Hooks
 * React hooks for creator analytics dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CreatorDashboardData,
  EarningsOverview,
  EngagementMetrics,
  ConversationAnalytics,
  MediaSalesAnalytics,
  PerformanceLevel,
  OptimizationSuggestion,
  RoyalAdvancedAnalytics,
  DashboardFilters,
} from '../types/pack257-creator-dashboard';
import {
  getCreatorDashboard,
  getEarningsOverview,
  getEngagementMetrics,
  getConversationAnalytics,
  getMediaSalesAnalytics,
  getPerformanceLevel,
  getOptimizationSuggestions,
  getRoyalAdvancedAnalytics,
  dismissSuggestion,
  actOnSuggestion,
} from '../services/pack257-creatorDashboardService';

// ============================================================================
// PRIMARY DASHBOARD HOOK
// ============================================================================

/**
 * Main hook for complete dashboard data
 */
export function useCreatorDashboard(filters?: DashboardFilters) {
  const [data, setData] = useState<CreatorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const dashboardData = await getCreatorDashboard(filters);
      setData(dashboardData);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching creator dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboard,
  };
}

// ============================================================================
// INDIVIDUAL METRICS HOOKS
// ============================================================================

/**
 * Hook for earnings overview
 */
export function useEarningsOverview() {
  const [data, setData] = useState<EarningsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEarnings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const earnings = await getEarningsOverview();
      setData(earnings);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching earnings overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  return {
    data,
    loading,
    error,
    refetch: fetchEarnings,
  };
}

/**
 * Hook for engagement metrics
 */
export function useEngagementMetrics() {
  const [data, setData] = useState<EngagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEngagement = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const engagement = await getEngagementMetrics();
      setData(engagement);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching engagement metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEngagement();
  }, [fetchEngagement]);

  return {
    data,
    loading,
    error,
    refetch: fetchEngagement,
  };
}

/**
 * Hook for conversation analytics
 */
export function useConversationAnalytics() {
  const [data, setData] = useState<ConversationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const conversations = await getConversationAnalytics();
      setData(conversations);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching conversation analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    data,
    loading,
    error,
    refetch: fetchConversations,
  };
}

/**
 * Hook for media sales analytics
 */
export function useMediaSalesAnalytics() {
  const [data, setData] = useState<MediaSalesAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMediaSales = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const mediaSales = await getMediaSalesAnalytics();
      setData(mediaSales);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching media sales analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMediaSales();
  }, [fetchMediaSales]);

  return {
    data,
    loading,
    error,
    refetch: fetchMediaSales,
  };
}

// ============================================================================
// PERFORMANCE TIER HOOK
// ============================================================================

/**
 * Hook for performance level and tier progression
 */
export function usePerformanceLevel() {
  const [data, setData] = useState<PerformanceLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPerformanceLevel = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const level = await getPerformanceLevel();
      setData(level);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching performance level:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerformanceLevel();
  }, [fetchPerformanceLevel]);

  return {
    data,
    loading,
    error,
    refetch: fetchPerformanceLevel,
  };
}

// ============================================================================
// OPTIMIZATION SUGGESTIONS HOOK
// ============================================================================

/**
 * Hook for AI optimization suggestions
 */
export function useOptimizationSuggestions() {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOptimizationSuggestions();
      setSuggestions(data);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching optimization suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(async (suggestionId: string) => {
    try {
      await dismissSuggestion(suggestionId);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    } catch (err) {
      console.error('Error dismissing suggestion:', err);
      throw err;
    }
  }, []);

  const markActedUpon = useCallback(async (suggestionId: string) => {
    try {
      await actOnSuggestion(suggestionId);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    } catch (err) {
      console.error('Error marking suggestion as acted upon:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return {
    suggestions,
    loading,
    error,
    dismiss,
    markActedUpon,
    refetch: fetchSuggestions,
  };
}

// ============================================================================
// ROYAL ADVANCED ANALYTICS HOOK
// ============================================================================

/**
 * Hook for Royal-exclusive advanced analytics
 */
export function useRoyalAdvancedAnalytics() {
  const [data, setData] = useState<RoyalAdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRoyal, setIsRoyal] = useState(false);

  const fetchRoyalAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const analytics = await getRoyalAdvancedAnalytics();
      setData(analytics);
      setIsRoyal(analytics !== null);
    } catch (err) {
      setError(err as Error);
      setIsRoyal(false);
      console.error('Error fetching Royal analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoyalAnalytics();
  }, [fetchRoyalAnalytics]);

  return {
    data,
    loading,
    error,
    isRoyal,
    refetch: fetchRoyalAnalytics,
  };
}

// ============================================================================
// COMBINED HOOKS
// ============================================================================

/**
 * Combined hook for all dashboard data with refresh control
 */
export function useCompleteDashboard(filters?: DashboardFilters) {
  const dashboard = useCreatorDashboard(filters);
  const suggestions = useOptimizationSuggestions();
  const royalAnalytics = useRoyalAdvancedAnalytics();

  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        dashboard.refetch(),
        suggestions.refetch(),
        royalAnalytics.refetch(),
      ]);
    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    } finally {
      setRefreshing(false);
    }
  }, [dashboard, suggestions, royalAnalytics]);

  return {
    dashboard: dashboard.data,
    suggestions: suggestions.suggestions,
    royalAnalytics: royalAnalytics.data,
    isRoyal: royalAnalytics.isRoyal,
    loading: dashboard.loading || suggestions.loading || royalAnalytics.loading,
    error: dashboard.error || suggestions.error || royalAnalytics.error,
    refreshing,
    refreshAll,
    dismissSuggestion: suggestions.dismiss,
    actOnSuggestion: suggestions.markActedUpon,
  };
}