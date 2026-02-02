/**
 * PACK 3.2 — useWallet Hook (Read-Only)
 * 
 * React hook for wallet state management.
 * All data is READ-ONLY from Firestore.
 * Token mutations happen ONLY via backend functions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  WalletApi, 
  WalletBalance, 
  Transaction, 
  TokenPack,
  CheckoutResponse
} from '../services/walletApi';

export interface UseWalletReturn {
  // State
  balance: number;
  loading: boolean;
  error: string | null;
  transactions: Transaction[];
  transactionsLoading: boolean;
  tokenPacks: TokenPack[];
  
  // Actions
  refreshTransactions: () => Promise<void>;
  purchaseTokens: (packageId: string) => Promise<CheckoutResponse>;
  
  // Derived
  hasTokens: (amount: number) => boolean;
}

/**
 * Hook for accessing wallet state (READ-ONLY)
 * 
 * Usage:
 * ```tsx
 * const { balance, loading, purchaseTokens, hasTokens } = useWallet();
 * 
 * if (hasTokens(10)) {
 *   // User can afford the action
 * }
 * 
 * // Purchase tokens (opens Stripe Checkout)
 * await purchaseTokens('standard');
 * ```
 */
export function useWallet(): UseWalletReturn {
  const { user } = useAuth();
  
  // Balance state (real-time subscription)
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Transactions state (on-demand)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  
  // Token packs (loaded once)
  const [tokenPacks, setTokenPacks] = useState<TokenPack[]>([]);
  
  // Subscribe to balance updates
  useEffect(() => {
    if (!user?.uid) {
      setBalance(0);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const unsubscribe = WalletApi.subscribeToWalletBalance(
      user.uid,
      (walletBalance: WalletBalance) => {
        setBalance(walletBalance.tokens);
        setLoading(false);
      },
      (err: Error) => {
        console.error('[useWallet] Balance subscription error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, [user?.uid]);
  
  // Load token packs on mount
  useEffect(() => {
    loadTokenPacks();
  }, []);
  
  const loadTokenPacks = async () => {
    try {
      const packs = await WalletApi.getTokenPacks();
      setTokenPacks(packs);
    } catch (err) {
      console.error('[useWallet] Failed to load token packs:', err);
    }
  };
  
  // Refresh transactions
  const refreshTransactions = useCallback(async () => {
    if (!user?.uid) {
      setTransactions([]);
      return;
    }
    
    setTransactionsLoading(true);
    
    try {
      const txs = await WalletApi.getTransactionHistory(user.uid, 50);
      setTransactions(txs);
    } catch (err) {
      console.error('[useWallet] Failed to load transactions:', err);
    } finally {
      setTransactionsLoading(false);
    }
  }, [user?.uid]);
  
  // Purchase tokens (opens Stripe Checkout)
  const purchaseTokens = useCallback(async (packageId: string): Promise<CheckoutResponse> => {
    if (!user?.uid) {
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }
    
    return WalletApi.purchaseTokens(packageId);
  }, [user?.uid]);
  
  // Check if user has enough tokens
  const hasTokens = useCallback((amount: number): boolean => {
    return balance >= amount;
  }, [balance]);
  
  return {
    // State
    balance,
    loading,
    error,
    transactions,
    transactionsLoading,
    tokenPacks,
    
    // Actions
    refreshTransactions,
    purchaseTokens,
    
    // Derived
    hasTokens,
  };
}

export default useWallet;
