/**
 * PACK 214 - Return Trigger Hook
 * Mobile integration for smart re-engagement
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface ReturnTriggerSettings {
  userId: string;
  enabled: boolean;
  userType: 'MALE_PAYER' | 'FEMALE_EARNER' | 'ROYAL_MALE' | 'NONBINARY' | 'INFLUENCER_EARNER' | 'LOW_POPULARITY';
  lastActiveAt: Date;
  accountCreatedAt: Date;
  inPanicMode: boolean;
  panicModeCooldownUntil?: Date;
  hasUnresolvedIncident: boolean;
  doNotDisturb: boolean;
  inMeetingOrEvent: boolean;
  abTestGroup?: 'A' | 'B';
  updatedAt: Date;
}

export interface ReturnTriggerStats {
  userId: string;
  totalTriggersSent: number;
  lastTriggerSentAt?: Date;
  triggersBy7Days: number;
  triggersBy30Days: number;
  averageResponseTimeMinutes?: number;
  conversionRate?: number;
  updatedAt: Date;
}

export interface ReturnTriggerEvent {
  eventId: string;
  userId: string;
  eventType: string;
  context?: any;
  createdAt: Date;
  processed: boolean;
  processedAt?: Date;
}

/**
 * Hook for managing return trigger settings and stats
 */
export function useReturnTriggers() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ReturnTriggerSettings | null>(null);
  const [stats, setStats] = useState<ReturnTriggerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen to settings changes
  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'return_trigger_settings', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            ...data,
            lastActiveAt: data.lastActiveAt?.toDate(),
            accountCreatedAt: data.accountCreatedAt?.toDate(),
            panicModeCooldownUntil: data.panicModeCooldownUntil?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          } as ReturnTriggerSettings);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading return trigger settings:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  /**
   * Update return trigger settings
   */
  const updateSettings = async (updates: {
    enabled?: boolean;
    doNotDisturb?: boolean;
  }) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const updateSettingsFunc = httpsCallable(functions, 'updateReturnTriggerSettings');
      await updateSettingsFunc(updates);
    } catch (err: any) {
      console.error('Error updating return trigger settings:', err);
      setError(err.message);
      throw err;
    }
  };

  /**
   * Enable/disable return triggers
   */
  const setEnabled = async (enabled: boolean) => {
    await updateSettings({ enabled });
  };

  /**
   * Enable/disable do not disturb mode
   */
  const setDoNotDisturb = async (doNotDisturb: boolean) => {
    await updateSettings({ doNotDisturb });
  };

  /**
   * Set panic mode
   */
  const setPanicMode = async (enabled: boolean, cooldownHours: number = 72) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const setPanicModeFunc = httpsCallable(functions, 'setUserPanicMode');
      await setPanicModeFunc({ enabled, cooldownHours });
    } catch (err: any) {
      console.error('Error setting panic mode:', err);
      setError(err.message);
      throw err;
    }
  };

  /**
   * Track user activity (resets break tracking)
   */
  const trackActivity = async () => {
    if (!user) return;

    try {
      const trackActivityFunc = httpsCallable(functions, 'onUserActivity');
      await trackActivityFunc({});
    } catch (err: any) {
      console.error('Error tracking activity:', err);
      // Don't throw - this is a background operation
    }
  };

  /**
   * Get return trigger stats
   */
  const getStats = async (): Promise<ReturnTriggerStats | null> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const getStatsFunc = httpsCallable<any, ReturnTriggerStats>(
        functions,
        'getReturnTriggerStats'
      );
      const result = await getStatsFunc({});
      
      const statsData = result.data as any;
      return {
        ...statsData,
        lastTriggerSentAt: statsData.lastTriggerSentAt
          ? (statsData.lastTriggerSentAt instanceof Date
              ? statsData.lastTriggerSentAt
              : new Date(statsData.lastTriggerSentAt))
          : undefined,
        updatedAt: statsData.updatedAt
          ? (statsData.updatedAt instanceof Date
              ? statsData.updatedAt
              : new Date(statsData.updatedAt))
          : undefined,
      } as ReturnTriggerStats;
    } catch (err: any) {
      console.error('Error getting return trigger stats:', err);
      setError(err.message);
      throw err;
    }
  };

  /**
   * Manually trigger a return event (for testing)
   */
  const triggerEvent = async (
    eventType: string,
    context?: any,
    forceDelivery: boolean = false
  ) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const triggerFunc = httpsCallable(functions, 'triggerReturnEvent');
      const result = await triggerFunc({
        userId: user.uid,
        eventType,
        context,
        forceDelivery,
      });
      return result.data;
    } catch (err: any) {
      console.error('Error triggering return event:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    settings,
    stats,
    loading,
    error,
    setEnabled,
    setDoNotDisturb,
    setPanicMode,
    trackActivity,
    getStats,
    triggerEvent,
    updateSettings,
  };
}

/**
 * Hook for listening to return trigger events for the current user
 */
export function useReturnTriggerEvents(limit: number = 10) {
  const { user } = useAuth();
  const [events, setEvents] = useState<ReturnTriggerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    // Note: This would require a query, but for simplicity we're showing the pattern
    // In production, you might want to use a paginated query
    setLoading(false);
    
    // Placeholder - implement actual Firestore query if needed
    // const q = query(
    //   collection(db, 'return_trigger_events'),
    //   where('userId', '==', user.uid),
    //   orderBy('createdAt', 'desc'),
    //   limit(limit)
    // );
    
    // const unsubscribe = onSnapshot(q, (snapshot) => {
    //   const eventList = snapshot.docs.map(doc => ({
    //     ...doc.data(),
    //     createdAt: doc.data().createdAt?.toDate(),
    //     processedAt: doc.data().processedAt?.toDate(),
    //   })) as ReturnTriggerEvent[];
    //   setEvents(eventList);
    //   setLoading(false);
    // });
    
    // return () => unsubscribe();
  }, [user, limit]);

  return {
    events,
    loading,
    error,
  };
}

/**
 * Effect hook to automatically track user activity
 * Should be used in the root App component
 */
export function useActivityTracking() {
  const { user } = useAuth();
  const { trackActivity } = useReturnTriggers();

  useEffect(() => {
    if (!user) return;

    // Track activity on mount
    trackActivity();

    // Track activity every 5 minutes while app is active
    const interval = setInterval(() => {
      trackActivity();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);
}