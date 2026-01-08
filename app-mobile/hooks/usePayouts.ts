/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * React hooks for payout methods and requests
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  PayoutMethod,
  PayoutRequest,
  PayoutConfig,
  PayoutMethodFormData,
} from '../types/payouts';
import * as PayoutService from '../services/payoutService';

// ============================================================================
// PAYOUT CONFIG HOOK
// ============================================================================

export function usePayoutConfig() {
  const [config, setConfig] = useState<PayoutConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchConfig() {
      try {
        setIsLoading(true);
        const data = await PayoutService.getPayoutConfig();
        if (mounted) {
          setConfig(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchConfig();

    return () => {
      mounted = false;
    };
  }, []);

  return { config, isLoading, error };
}

// ============================================================================
// PAYOUT METHODS HOOK
// ============================================================================

export function usePayoutMethods(userId: string | null) {
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      const data = await PayoutService.getPayoutMethods(userId);
      setMethods(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createMethod = useCallback(
    async (payload: PayoutMethodFormData): Promise<string> => {
      if (!userId) throw new Error('User not authenticated');

      const methodId = await PayoutService.createPayoutMethod(userId, payload);
      await refresh();
      return methodId;
    },
    [userId, refresh]
  );

  const updateMethod = useCallback(
    async (
      methodId: string,
      updates: Partial<PayoutMethodFormData>
    ): Promise<void> => {
      if (!userId) throw new Error('User not authenticated');

      await PayoutService.updatePayoutMethod(userId, methodId, updates);
      await refresh();
    },
    [userId, refresh]
  );

  const deleteMethod = useCallback(
    async (methodId: string): Promise<void> => {
      await PayoutService.deletePayoutMethod(methodId);
      await refresh();
    },
    [refresh]
  );

  const getDefaultMethod = useCallback((): PayoutMethod | null => {
    return methods.find((m) => m.isDefault) || methods[0] || null;
  }, [methods]);

  return {
    methods,
    isLoading,
    error,
    refresh,
    createMethod,
    updateMethod,
    deleteMethod,
    getDefaultMethod,
  };
}

// ============================================================================
// PAYOUT REQUESTS HOOK
// ============================================================================

export function usePayoutRequests(userId: string | null) {
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      const data = await PayoutService.getPayoutRequests(userId);
      setRequests(data.requests);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setNextPageToken(data.nextPageToken);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMore) return;

    try {
      setIsLoadingMore(true);
      const data = await PayoutService.getPayoutRequests(
        userId,
        50,
        nextPageToken
      );
      setRequests((prev) => [...prev, ...data.requests]);
      setHasMore(data.hasMore);
      setNextPageToken(data.nextPageToken);
      setTotal(data.total);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, hasMore, isLoadingMore, nextPageToken]);

  const createRequest = useCallback(
    async (methodId: string, requestedTokens: number): Promise<string> => {
      if (!userId) throw new Error('User not authenticated');

      const requestId = await PayoutService.createPayoutRequest(
        userId,
        methodId,
        requestedTokens
      );
      await refresh();
      return requestId;
    },
    [userId, refresh]
  );

  const getPendingRequests = useCallback((): PayoutRequest[] => {
    return requests.filter(
      (r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW'
    );
  }, [requests]);

  const getTotalPendingTokens = useCallback((): number => {
    return getPendingRequests().reduce(
      (sum, r) => sum + r.requestedTokens,
      0
    );
  }, [getPendingRequests]);

  return {
    requests,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
    createRequest,
    getPendingRequests,
    getTotalPendingTokens,
  };
}

// ============================================================================
// COMBINED PAYOUT HOOK (for convenience)
// ============================================================================

export function usePayoutSystem(userId: string | null) {
  const config = usePayoutConfig();
  const methods = usePayoutMethods(userId);
  const requests = usePayoutRequests(userId);

  const canRequestPayout = useCallback(
    (availableTokens: number, requestedTokens: number) => {
      if (!config.config) {
        return {
          canRequest: false,
          reason: 'Configuration not loaded',
        };
      }

      return PayoutService.canRequestPayout(
        availableTokens,
        requestedTokens,
        config.config.minPayoutTokens
      );
    },
    [config.config]
  );

  const calculateFiatAmount = useCallback(
    (tokens: number): number => {
      if (!config.config) return 0;
      return tokens * config.config.tokenToEurRate;
    },
    [config.config]
  );

  return {
    config: config.config,
    configLoading: config.isLoading,
    configError: config.error,
    methods: methods.methods,
    methodsLoading: methods.isLoading,
    methodsError: methods.error,
    createMethod: methods.createMethod,
    updateMethod: methods.updateMethod,
    deleteMethod: methods.deleteMethod,
    getDefaultMethod: methods.getDefaultMethod,
    refreshMethods: methods.refresh,
    requests: requests.requests,
    requestsTotal: requests.total,
    requestsHasMore: requests.hasMore,
    requestsLoading: requests.isLoading,
    requestsLoadingMore: requests.isLoadingMore,
    requestsError: requests.error,
    createRequest: requests.createRequest,
    refreshRequests: requests.refresh,
    loadMoreRequests: requests.loadMore,
    getPendingRequests: requests.getPendingRequests,
    getTotalPendingTokens: requests.getTotalPendingTokens,
    canRequestPayout,
    calculateFiatAmount,
  };
}