/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * React hook for managing safety timers
 */

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import * as Location from 'expo-location';
import {
  SafetyTimerSummary,
  CreateSafetyTimerRequest,
  CreateSafetyTimerResponse,
  CheckInSafetyTimerResponse,
  SafetyAlertDetails,
  SAFETY_TIMER_DURATIONS,
  SafetyTimerDuration,
} from '../types/safetyTimer';

const functions = getFunctions();

export interface UseSafetyTimersResult {
  // Timer management
  activeTimer: SafetyTimerSummary | null;
  archivedTimers: SafetyTimerSummary[];
  loading: boolean;
  error: string | null;
  
  // Actions
  createTimer: (durationMinutes: SafetyTimerDuration, note: string, trustedContacts: string[]) => Promise<void>;
  checkIn: (timerId: string) => Promise<void>;
  cancelTimer: (timerId: string) => Promise<void>;
  refreshTimers: () => Promise<void>;
  
  // Countdown
  remainingSeconds: number;
}

export function useSafetyTimers(): UseSafetyTimersResult {
  const [activeTimer, setActiveTimer] = useState<SafetyTimerSummary | null>(null);
  const [archivedTimers, setArchivedTimers] = useState<SafetyTimerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Fetch timers from backend
  const fetchTimers = useCallback(async () => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const getUserTimers = httpsCallable<
        { limit?: number; includeArchived?: boolean },
        { success: boolean; timers: SafetyTimerSummary[] }
      >(functions, 'safety_getUserTimers');

      const result = await getUserTimers({ limit: 10, includeArchived: true });

      if (result.data.success) {
        const timers = result.data.timers;
        
        // Separate active and archived timers
        const active = timers.find(t => t.status === 'active');
        const archived = timers.filter(t => t.status !== 'active').slice(0, 3);

        setActiveTimer(active || null);
        setArchivedTimers(archived);

        if (active) {
          setRemainingSeconds(active.remainingSeconds);
        }
      }
    } catch (err: any) {
      console.error('[SafetyTimers] Error fetching timers:', err);
      setError(err.message || 'Failed to fetch timers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new safety timer
  const createTimer = useCallback(async (
    durationMinutes: SafetyTimerDuration,
    note: string,
    trustedContacts: string[]
  ) => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      throw new Error('Not authenticated');
    }

    // Validate input
    if (!SAFETY_TIMER_DURATIONS.includes(durationMinutes)) {
      setError('Invalid duration');
      throw new Error('Invalid duration');
    }

    if (!note || note.length > 200) {
      setError('Note must be between 1-200 characters');
      throw new Error('Note must be between 1-200 characters');
    }

    if (trustedContacts.length > 5) {
      setError('Maximum 5 trusted contacts allowed');
      throw new Error('Maximum 5 trusted contacts allowed');
    }

    try {
      setLoading(true);
      setError(null);

      // Get current location if available
      let lastKnownLocation = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lastKnownLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
          };
        }
      } catch (locError) {
        console.log('[SafetyTimers] Could not get location:', locError);
        // Continue without location - it's optional
      }

      const createTimerFunc = httpsCallable<
        CreateSafetyTimerRequest & { lastKnownLocation?: any },
        CreateSafetyTimerResponse
      >(functions, 'safety_createTimer');

      const result = await createTimerFunc({
        durationMinutes,
        note,
        trustedContacts,
        lastKnownLocation,
      });

      if (result.data.success) {
        // Refresh timers to get the new one
        await fetchTimers();
      } else {
        throw new Error(result.data.message || 'Failed to create timer');
      }
    } catch (err: any) {
      console.error('[SafetyTimers] Error creating timer:', err);
      const errorMessage = err.message || 'Failed to create timer';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchTimers]);

  // Check in on a timer (mark as completed_ok)
  const checkIn = useCallback(async (timerId: string) => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      throw new Error('Not authenticated');
    }

    try {
      setLoading(true);
      setError(null);

      const checkInFunc = httpsCallable<
        { timerId: string },
        CheckInSafetyTimerResponse
      >(functions, 'safety_checkInTimer');

      const result = await checkInFunc({ timerId });

      if (result.data.success) {
        // Clear active timer and refresh
        setActiveTimer(null);
        setRemainingSeconds(0);
        await fetchTimers();
      } else {
        throw new Error(result.data.message || 'Failed to check in');
      }
    } catch (err: any) {
      console.error('[SafetyTimers] Error checking in:', err);
      const errorMessage = err.message || 'Failed to check in';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchTimers]);

  // Cancel a timer
  const cancelTimer = useCallback(async (timerId: string) => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      throw new Error('Not authenticated');
    }

    try {
      setLoading(true);
      setError(null);

      const cancelFunc = httpsCallable<
        { timerId: string },
        { success: boolean; message?: string }
      >(functions, 'safety_cancelTimer');

      const result = await cancelFunc({ timerId });

      if (result.data.success) {
        // Clear active timer and refresh
        setActiveTimer(null);
        setRemainingSeconds(0);
        await fetchTimers();
      } else {
        throw new Error(result.data.message || 'Failed to cancel timer');
      }
    } catch (err: any) {
      console.error('[SafetyTimers] Error cancelling timer:', err);
      const errorMessage = err.message || 'Failed to cancel timer';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchTimers]);

  // Countdown timer for active timer
  useEffect(() => {
    if (!activeTimer || activeTimer.status !== 'active') {
      setRemainingSeconds(0);
      return;
    }

    // Update remaining seconds every second
    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        const newValue = Math.max(0, prev - 1);
        
        // If timer expired, refresh timers
        if (newValue === 0 && prev > 0) {
          fetchTimers();
        }
        
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer, fetchTimers]);

  // Initial load
  useEffect(() => {
    fetchTimers();
  }, [fetchTimers]);

  return {
    activeTimer,
    archivedTimers,
    loading,
    error,
    createTimer,
    checkIn,
    cancelTimer,
    refreshTimers: fetchTimers,
    remainingSeconds,
  };
}

export interface UseSafetyAlertsResult {
  alerts: SafetyAlertDetails[];
  loading: boolean;
  error: string | null;
  refreshAlerts: () => Promise<void>;
}

/**
 * Hook for trusted contacts to view safety alerts
 */
export function useSafetyAlerts(): UseSafetyAlertsResult {
  const [alerts, setAlerts] = useState<SafetyAlertDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const getAlerts = httpsCallable<
        { limit?: number },
        { success: boolean; alerts: SafetyAlertDetails[] }
      >(functions, 'safety_getAlerts');

      const result = await getAlerts({ limit: 20 });

      if (result.data.success) {
        setAlerts(result.data.alerts);
      }
    } catch (err: any) {
      console.error('[SafetyAlerts] Error fetching alerts:', err);
      setError(err.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    refreshAlerts: fetchAlerts,
  };
}