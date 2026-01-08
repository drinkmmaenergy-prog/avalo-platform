/**
 * PACK 81 — useWallet Hook
 * React hook for accessing creator wallet data
 */

import { useState, useEffect, useCallback } from 'react';
import { WalletSummary } from '../types/earnings';
import { getCreatorWalletSummary } from '../services/earningsService';

interface UseWalletResult {
  wallet: WalletSummary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage creator wallet data
 */
export function useWallet(userId?: string): UseWalletResult {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getCreatorWalletSummary(userId);
      setWallet(data);
    } catch (err) {
      console.error('Error fetching wallet:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return {
    wallet,
    isLoading,
    error,
    refresh: fetchWallet,
  };
}