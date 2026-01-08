import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type AccountStatus = 
  | 'ACTIVE'
  | 'WARNING'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED_PERMANENT'
  | 'SHADOW_RESTRICTED'
  | 'REVIEW';

export interface AccountSafetyData {
  status: AccountStatus;
  statusExpiresAt: number | null;
  reason?: string;
  violationCount?: number;
  lastUpdatedAt?: number;
}

export interface AccountSafetyState {
  data: AccountSafetyData | null;
  loading: boolean;
  error: Error | null;
  
  // Helper booleans
  isActive: boolean;
  isWarning: boolean;
  isRestricted: boolean;
  isSuspended: boolean;
  isBannedPermanent: boolean;
  isShadowRestricted: boolean;
  isReview: boolean;
  
  // Formatted data
  statusMessage: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
  
  // Actions
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL = 60000; // 60 seconds

/**
 * Hook to fetch and monitor account safety status
 * Uses the new Phase 30C-1 Account Status Engine
 */
export const useAccountSafety = (userId: string | undefined): AccountSafetyState => {
  const [data, setData] = useState<AccountSafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      // First try to get from local Firestore (faster)
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        setData({
          status: 'ACTIVE',
          statusExpiresAt: null,
        });
        setError(null);
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const status = userData?.accountStatus || 'ACTIVE';
      const statusExpiresAt = userData?.statusExpiresAt || null;
      const reason = userData?.accountStatusReason;
      const lastUpdatedAt = userData?.accountStatusUpdatedAt?.toMillis();
      
      // Get violation count from moderation stats
      const statsRef = doc(db, 'userModerationStats', userId);
      const statsSnap = await getDoc(statsRef);
      const violationCount = statsSnap.exists() ? (statsSnap.data()?.totalIncidents || 0) : 0;

      setData({
        status: status as AccountStatus,
        statusExpiresAt,
        reason,
        violationCount,
        lastUpdatedAt,
      });
      setError(null);
      
      // If status is expired, call backend to cleanup
      if (statusExpiresAt && statusExpiresAt < Date.now()) {
        const functions = getFunctions();
        const getStatus = httpsCallable(functions, 'account_getStatus_callable');
        await getStatus({});
        // Refresh again after cleanup
        setTimeout(() => fetchStatus(), 1000);
      }
    } catch (err) {
      console.error('Error fetching account safety status:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      
      // Fail-safe to ACTIVE
      setData({
        status: 'ACTIVE',
        statusExpiresAt: null,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!userId) return;

    const intervalId = setInterval(() => {
      fetchStatus();
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [userId, fetchStatus]);

  // Check expiration and auto-refresh
  useEffect(() => {
    if (!data?.statusExpiresAt) return;

    const timeUntilExpiry = data.statusExpiresAt - Date.now();
    if (timeUntilExpiry > 0) {
      const timeoutId = setTimeout(() => {
        fetchStatus();
      }, timeUntilExpiry + 2000); // Add 2 second buffer

      return () => clearTimeout(timeoutId);
    }
  }, [data?.statusExpiresAt, fetchStatus]);

  // Compute helper booleans
  const isActive = data?.status === 'ACTIVE';
  const isWarning = data?.status === 'WARNING';
  const isRestricted = data?.status === 'RESTRICTED';
  const isSuspended = data?.status === 'SUSPENDED';
  const isBannedPermanent = data?.status === 'BANNED_PERMANENT';
  const isShadowRestricted = data?.status === 'SHADOW_RESTRICTED';
  const isReview = data?.status === 'REVIEW';

  const statusMessage = data?.reason || null;
  const expiresAt = data?.statusExpiresAt ? new Date(data.statusExpiresAt) : null;
  const isExpired = data?.statusExpiresAt ? data.statusExpiresAt < Date.now() : false;

  return {
    data,
    loading,
    error,
    isActive,
    isWarning,
    isRestricted,
    isSuspended,
    isBannedPermanent,
    isShadowRestricted,
    isReview,
    statusMessage,
    expiresAt,
    isExpired,
    refresh: fetchStatus,
  };
};