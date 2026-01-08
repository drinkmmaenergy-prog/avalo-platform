/**
 * PACK 76 - useGeoshareSession Hook
 * React hook for managing geoshare session state and location updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getGeoshareSession,
  startGeoshareSession,
  stopGeoshareSession,
} from '../services/geoshareService';
import {
  startLocationTracking,
  stopLocationTracking,
  isTracking,
} from '../services/locationTrackingService';
import {
  GeoshareSessionInfo,
  PartnerLocation,
} from '../types/geoshare';

export interface UseGeoshareSessionResult {
  // Session state
  session: GeoshareSessionInfo | null;
  partnerLocation: PartnerLocation | null;
  isActive: boolean;
  remainingSeconds: number;
  
  // Loading and error states
  loading: boolean;
  error: string | null;
  
  // Actions
  startSession: (partnerId: string, durationMinutes: number) => Promise<void>;
  stopSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Hook for managing geoshare session
 */
export function useGeoshareSession(
  sessionId?: string
): UseGeoshareSessionResult {
  const [session, setSession] = useState<GeoshareSessionInfo | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch session data from server
   */
  const fetchSession = useCallback(async (id: string) => {
    try {
      const data = await getGeoshareSession(id);
      setSession(data.session);
      setPartnerLocation(data.partnerLocation);
      setRemainingSeconds(data.session.remainingSeconds);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching geoshare session:', err);
      setError(err.message);
    }
  }, []);

  /**
   * Start a new geoshare session
   */
  const startSession = useCallback(
    async (partnerId: string, durationMinutes: number) => {
      setLoading(true);
      setError(null);

      try {
        // Start session on backend
        const result = await startGeoshareSession(partnerId, durationMinutes);

        // Start location tracking
        await startLocationTracking(result.sessionId);

        // Fetch initial session data
        await fetchSession(result.sessionId);

        setLoading(false);
      } catch (err: any) {
        console.error('Error starting geoshare session:', err);
        setError(err.message);
        setLoading(false);
        throw err;
      }
    },
    [fetchSession]
  );

  /**
   * Stop the current session
   */
  const stopSession = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Stop location tracking
      await stopLocationTracking();

      // Stop session on backend
      await stopGeoshareSession(session.sessionId);

      // Clear state
      setSession(null);
      setPartnerLocation(null);
      setRemainingSeconds(0);

      setLoading(false);
    } catch (err: any) {
      console.error('Error stopping geoshare session:', err);
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [session]);

  /**
   * Refresh session data
   */
  const refreshSession = useCallback(async () => {
    if (!sessionId && !session?.sessionId) {
      return;
    }

    const id = sessionId || session?.sessionId;
    if (id) {
      await fetchSession(id);
    }
  }, [sessionId, session?.sessionId, fetchSession]);

  /**
   * Setup polling for partner location updates
   */
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') {
      // Clear interval if session is not active
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Poll for partner location every 10 seconds
    intervalRef.current = setInterval(async () => {
      try {
        const data = await getGeoshareSession(session.sessionId);
        setPartnerLocation(data.partnerLocation);
        setRemainingSeconds(data.session.remainingSeconds);

        // Check if session expired
        if (data.session.status !== 'ACTIVE') {
          setSession(data.session);
          await stopLocationTracking();
        }
      } catch (err) {
        console.error('Error polling geoshare session:', err);
      }
    }, 10000); // 10 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [session]);

  /**
   * Setup countdown timer
   */
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE' || remainingSeconds <= 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    // Countdown every second
    countdownRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        
        // Stop tracking when time runs out
        if (next <= 0) {
          stopLocationTracking();
          setSession((prevSession) =>
            prevSession ? { ...prevSession, status: 'EXPIRED' } : null
          );
        }
        
        return Math.max(0, next);
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [session, remainingSeconds]);

  /**
   * Load session on mount if sessionId provided
   */
  useEffect(() => {
    if (sessionId) {
      fetchSession(sessionId);
    }
  }, [sessionId, fetchSession]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Clear intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }

      // Stop location tracking if active
      if (isTracking()) {
        stopLocationTracking();
      }
    };
  }, []);

  return {
    session,
    partnerLocation,
    isActive: session?.status === 'ACTIVE',
    remainingSeconds,
    loading,
    error,
    startSession,
    stopSession,
    refreshSession,
  };
}