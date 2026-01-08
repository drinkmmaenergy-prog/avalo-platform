import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type TrustStatus = 'ACTIVE' | 'WARNING' | 'SOFT_RESTRICTED' | 'SHADOWBAN' | 'HARD_BANNED';
export type AppealStatus = 'NONE' | 'PENDING' | 'RESOLVED';

export interface TrustData {
  status: TrustStatus;
  message?: string;
  until?: Date | null;
  canAppeal: boolean;
  appealStatus: AppealStatus;
}

export interface UserRestrictionState {
  // Trust data
  trust: TrustData | null;
  
  // Loading state
  loading: boolean;
  error: Error | null;
  
  // Helper booleans
  isActive: boolean;
  isWarning: boolean;
  isSoftRestricted: boolean;
  isShadowBanned: boolean;
  isHardBanned: boolean;
  canAppeal: boolean;
  
  // Formatted data
  restrictionMessage: string | null;
  restrictionEndsAt: Date | null;
  
  // Refresh function
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL = 45000; // 45 seconds

/**
 * Hook to fetch and monitor user restriction status
 * Auto-refreshes every 45 seconds
 * Returns restriction state and helper booleans
 */
export const useUserRestriction = (userId: string | undefined): UserRestrictionState => {
  const [trust, setTrust] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrustData = useCallback(async () => {
    if (!userId) {
      setTrust(null);
      setLoading(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (!userDoc.exists()) {
        // User document doesn't exist yet - treat as active
        setTrust({
          status: 'ACTIVE',
          message: undefined,
          until: null,
          canAppeal: false,
          appealStatus: 'NONE',
        });
        setError(null);
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const trustData = userData?.trust || {};

      // Parse the trust data with safe defaults
      const status: TrustStatus = trustData.status || 'ACTIVE';
      const message = trustData.message || undefined;
      const until = trustData.until?.toDate() || null;
      const canAppeal = trustData.canAppeal === true;
      const appealStatus: AppealStatus = trustData.appealStatus || 'NONE';

      setTrust({
        status,
        message,
        until,
        canAppeal,
        appealStatus,
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching trust data:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      
      // On error, treat as active to avoid blocking users inappropriately
      setTrust({
        status: 'ACTIVE',
        message: undefined,
        until: null,
        canAppeal: false,
        appealStatus: 'NONE',
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchTrustData();
  }, [fetchTrustData]);

  // Auto-refresh every 45 seconds
  useEffect(() => {
    if (!userId) return;

    const intervalId = setInterval(() => {
      fetchTrustData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [userId, fetchTrustData]);

  // Check if restriction has expired
  useEffect(() => {
    if (!trust?.until) return;

    const now = new Date();
    if (trust.until < now && trust.status !== 'ACTIVE') {
      // Restriction expired, refresh to get updated status
      fetchTrustData();
    }

    // Set up a timer to refresh when restriction expires
    const timeUntilExpiry = trust.until.getTime() - now.getTime();
    if (timeUntilExpiry > 0) {
      const timeoutId = setTimeout(() => {
        fetchTrustData();
      }, timeUntilExpiry + 1000); // Add 1 second buffer

      return () => clearTimeout(timeoutId);
    }
  }, [trust?.until, trust?.status, fetchTrustData]);

  // Compute helper booleans
  const isActive = trust?.status === 'ACTIVE';
  const isWarning = trust?.status === 'WARNING';
  const isSoftRestricted = trust?.status === 'SOFT_RESTRICTED';
  const isShadowBanned = trust?.status === 'SHADOWBAN';
  const isHardBanned = trust?.status === 'HARD_BANNED';
  const canAppeal = trust?.canAppeal === true;

  const restrictionMessage = trust?.message || null;
  const restrictionEndsAt = trust?.until || null;

  return {
    trust,
    loading,
    error,
    isActive,
    isWarning,
    isSoftRestricted,
    isShadowBanned,
    isHardBanned,
    canAppeal,
    restrictionMessage,
    restrictionEndsAt,
    refresh: fetchTrustData,
  };
};