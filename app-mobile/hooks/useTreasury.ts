/**
 * PACK 128 - Treasury Hooks (Mobile)
 * React hooks for treasury operations
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getUserBalance,
  getCreatorBalance,
  checkPayoutEligibility,
  requestPayout,
  getTreasuryErrorMessage,
} from '../services/treasuryService';
import {
  WalletBalance,
  PayoutSafetyCheck,
} from '../types/treasury';

// ============================================================================
// USER BALANCE HOOK
// ============================================================================

export function useUserBalance(userId: string | null) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getUserBalance(userId);
      setBalance(data);
    } catch (err) {
      setError(getTreasuryErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  return {
    balance,
    isLoading,
    error,
    refresh: loadBalance,
  };
}

// ============================================================================
// CREATOR BALANCE HOOK
// ============================================================================

export function useCreatorBalance(userId: string | null) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getCreatorBalance(userId);
      setBalance(data);
    } catch (err) {
      setError(getTreasuryErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  return {
    balance,
    isLoading,
    error,
    refresh: loadBalance,
  };
}

// ============================================================================
// PAYOUT ELIGIBILITY HOOK
// ============================================================================

export function usePayoutEligibility(
  userId: string | null,
  methodId: string | null,
  tokenAmount: number
) {
  const [eligibility, setEligibility] = useState<PayoutSafetyCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEligibility = useCallback(async () => {
    if (!userId || !methodId || tokenAmount <= 0) return;

    setIsChecking(true);
    setError(null);

    try {
      const check = await checkPayoutEligibility(userId, methodId, tokenAmount);
      setEligibility(check);
    } catch (err) {
      setError(getTreasuryErrorMessage(err));
    } finally {
      setIsChecking(false);
    }
  }, [userId, methodId, tokenAmount]);

  useEffect(() => {
    checkEligibility();
  }, [checkEligibility]);

  return {
    eligibility,
    isChecking,
    error,
    recheck: checkEligibility,
  };
}

// ============================================================================
// PAYOUT REQUEST HOOK
// ============================================================================

export function usePayoutRequest(userId: string | null) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [payoutRequestId, setPayoutRequestId] = useState<string | null>(null);

  const submitRequest = useCallback(
    async (methodId: string, tokenAmount: number) => {
      if (!userId) {
        setError('User not authenticated');
        return null;
      }

      setIsRequesting(true);
      setError(null);
      setSuccess(false);
      setPayoutRequestId(null);

      try {
        const result = await requestPayout(userId, methodId, tokenAmount);

        if (result.success) {
          setSuccess(true);
          setPayoutRequestId(result.payoutRequestId || null);
          return result;
        } else {
          setError(result.message || 'Payout request failed');
          return result;
        }
      } catch (err) {
        const errorMsg = getTreasuryErrorMessage(err);
        setError(errorMsg);
        return null;
      } finally {
        setIsRequesting(false);
      }
    },
    [userId]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
    setPayoutRequestId(null);
  }, []);

  return {
    submitRequest,
    isRequesting,
    error,
    success,
    payoutRequestId,
    reset,
  };
}

// ============================================================================
// COMBINED TREASURY HOOK
// ============================================================================

/**
 * All-in-one treasury hook for convenience
 */
export function useTreasury(userId: string | null, isCreator: boolean = false) {
  const userBalance = useUserBalance(userId);
  const creatorBalance = useCreatorBalance(isCreator ? userId : null);
  const payoutRequest = usePayoutRequest(userId);

  const refreshAll = useCallback(() => {
    userBalance.refresh();
    if (isCreator) {
      creatorBalance.refresh();
    }
  }, [userBalance, creatorBalance, isCreator]);

  return {
    // User balance
    userBalance: userBalance.balance,
    userBalanceLoading: userBalance.isLoading,
    userBalanceError: userBalance.error,
    refreshUserBalance: userBalance.refresh,

    // Creator balance (if applicable)
    creatorBalance: creatorBalance.balance,
    creatorBalanceLoading: creatorBalance.isLoading,
    creatorBalanceError: creatorBalance.error,
    refreshCreatorBalance: creatorBalance.refresh,

    // Payout operations
    submitPayoutRequest: payoutRequest.submitRequest,
    payoutRequesting: payoutRequest.isRequesting,
    payoutError: payoutRequest.error,
    payoutSuccess: payoutRequest.success,
    payoutRequestId: payoutRequest.payoutRequestId,
    resetPayout: payoutRequest.reset,

    // Combined actions
    refreshAll,
  };
}