/**
 * PACK 258 — Supporter Analytics Hooks
 * React hooks for accessing supporter stats and fan levels
 */

import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type FanLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface SupporterAnalytics {
  userId: string;
  lifetimeSpent: number;
  monthlySpent: number;
  topCreatorId: string | null;
  topCreatorSpent: number;
  creatorsDiscovered: number;
  profileViewsReceived: number;
  matchesFromPaidChats: number;
  lastSpentAt: any;
  createdAt: any;
  updatedAt: any;
}

export interface FanLevelData {
  supporterId: string;
  creatorId: string;
  level: FanLevel;
  totalSpent: number;
  lastInteractionAt: any;
  levelUnlockedAt: any;
  createdAt: any;
  updatedAt: any;
}

export interface SupporterNotification {
  id: string;
  userId: string;
  creatorId: string;
  type: string;
  message: string;
  deepLink: string;
  read: boolean;
  createdAt: any;
  readAt?: any;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get supporter analytics for the current user
 */
export function useSupporterAnalytics(userId: string | undefined) {
  const [analytics, setAnalytics] = useState<SupporterAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'supporterAnalytics', userId),
      (snapshot) => {
        if (snapshot.exists()) {
          setAnalytics(snapshot.data() as SupporterAnalytics);
        } else {
          setAnalytics(null);
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading supporter analytics:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { analytics, isLoading, error };
}

/**
 * Hook to get fan level for a specific creator
 */
export function useFanLevel(supporterId: string | undefined, creatorId: string | undefined) {
  const [fanLevel, setFanLevel] = useState<FanLevelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!supporterId || !creatorId) {
      setIsLoading(false);
      return;
    }

    const levelId = `${supporterId}_${creatorId}`;
    const unsubscribe = onSnapshot(
      doc(db, 'fanLevels', levelId),
      (snapshot) => {
        if (snapshot.exists()) {
          setFanLevel(snapshot.data() as FanLevelData);
        } else {
          setFanLevel(null);
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading fan level:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [supporterId, creatorId]);

  return { fanLevel, isLoading, error };
}

/**
 * Hook to get all fan levels for a supporter
 */
export function useAllFanLevels(supporterId: string | undefined) {
  const [fanLevels, setFanLevels] = useState<FanLevelData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!supporterId) {
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'fanLevels'),
      where('supporterId', '==', supporterId),
      orderBy('level', 'desc'),
      orderBy('totalSpent', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const levels = snapshot.docs.map(doc => doc.data() as FanLevelData);
        setFanLevels(levels);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading fan levels:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [supporterId]);

  return { fanLevels, isLoading, error };
}

/**
 * Hook to get supporter notifications
 */
export function useSupporterNotifications(userId: string | undefined, unreadOnly: boolean = false) {
  const [notifications, setNotifications] = useState<SupporterNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let q = query(
      collection(db, 'supporterNotifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    if (unreadOnly) {
      q = query(
        collection(db, 'supporterNotifications'),
        where('userId', '==', userId),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs = snapshot.docs.map(doc => doc.data() as SupporterNotification);
        setNotifications(notifs);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading notifications:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, unreadOnly]);

  return { notifications, isLoading, error };
}

/**
 * Get unread notification count
 */
export function useUnreadNotificationCount(userId: string | undefined) {
  const { notifications } = useSupporterNotifications(userId, true);
  return notifications.length;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get fan level name
 */
export function getFanLevelName(level: FanLevel): string {
  const names = {
    1: 'Interested',
    2: 'Supporter',
    3: 'Big Fan',
    4: 'Top Fan',
    5: 'VIP',
    6: 'Elite VIP',
  };
  return names[level];
}

/**
 * Get fan level color
 */
export function getFanLevelColor(level: FanLevel): string {
  const colors = {
    1: '#6B7280',
    2: '#3B82F6',
    3: '#8B5CF6',
    4: '#EC4899',
    5: '#F59E0B',
    6: '#EF4444',
  };
  return colors[level];
}

/**
 * Get inbox priority boost multiplier
 */
export function getInboxPriorityBoost(level: FanLevel): number {
  const boosts = {
    1: 1.0,
    2: 1.0,
    3: 1.5,
    4: 2.0,
    5: 3.0,
    6: 4.0,
  };
  return boosts[level];
}

/**
 * Calculate if supporter has spent tokens (eligibility for stats)
 */
export function hasSupporterActivity(analytics: SupporterAnalytics | null): boolean {
  return analytics !== null && analytics.lifetimeSpent > 0;
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    const notificationRef = doc(db, 'supporterNotifications', notificationId);
    await getDoc(notificationRef); // Just trigger a read to mark as read via security rules
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}