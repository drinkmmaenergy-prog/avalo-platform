/**
 * PACK 92 — Notifications Hook
 * React hook for managing notifications
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Notification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  subscribeToNotifications,
} from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();

  // Real-time subscription
  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToNotifications(
      user.uid,
      (notifs, unread) => {
        setNotifications(notifs);
        setUnreadCount(unread);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Load more notifications
  const loadMore = useCallback(async () => {
    if (!nextPageToken || loading) return;

    try {
      const result = await getNotifications(50, nextPageToken);
      setNotifications((prev) => [...prev, ...result.notifications]);
      setHasMore(result.hasMore);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      setError(err.message);
    }
  }, [nextPageToken, loading]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Refresh
  const refresh = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getNotifications(50);
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setHasMore(result.hasMore);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh,
  };
}