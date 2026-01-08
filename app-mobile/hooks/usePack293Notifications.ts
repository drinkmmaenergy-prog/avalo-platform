/**
 * PACK 293 - Notifications & Activity Center
 * React hook for managing notifications
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Notification,
  NotificationSettings,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification,
  getNotificationSettings,
  updateNotificationSettings,
  subscribeToNotifications,
  getNotificationDeepLink,
} from '../services/pack293-notification-service';
import { useAuth } from '../contexts/AuthContext';

// ============================================================================
// NOTIFICATIONS HOOK
// ============================================================================

export function usePack293Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Load notifications
  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!user) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await getNotifications(
        isRefresh ? undefined : cursor || undefined,
        50
      );

      if (isRefresh) {
        setNotifications(result.items);
        setCursor(result.nextCursor);
      } else {
        setNotifications(prev => cursor ? [...prev, ...result.items] : result.items);
        setCursor(result.nextCursor);
      }

      setUnreadCount(result.unreadCount);
      setHasMore(result.nextCursor !== null);
    } catch (err: any) {
      console.error('Error loading notifications:', err);
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, cursor]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    unsubscribeRef.current = subscribeToNotifications(
      user.uid,
      (notification) => {
        // Add or update notification in list
        setNotifications(prev => {
          const index = prev.findIndex(n => n.notificationId === notification.notificationId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = notification;
            return updated;
          } else {
            return [notification, ...prev];
          }
        });

        // Update unread count
        if (notification.status !== 'READ' && notification.status !== 'DISMISSED') {
          setUnreadCount(prev => prev + 1);
        }
      },
      (error) => {
        console.error('Notification subscription error:', error);
      }
    );

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      loadNotifications(true);
    }
  }, [user]);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      
      setNotifications(prev =>
        prev.map(n =>
          n.notificationId === notificationId
            ? { ...n, status: 'READ' as const, readAt: new Date() }
            : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
      throw err;
    }
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      
      setNotifications(prev =>
        prev.map(n => ({ ...n, status: 'READ' as const, readAt: new Date() }))
      );
      
      setUnreadCount(0);
    } catch (err: any) {
      console.error('Error marking all notifications as read:', err);
      throw err;
    }
  }, []);

  // Dismiss notification
  const dismiss = useCallback(async (notificationId: string) => {
    try {
      await dismissNotification(notificationId);
      
      setNotifications(prev =>
        prev.filter(n => n.notificationId !== notificationId)
      );
      
      // Update unread count if notification was unread
      const notification = notifications.find(n => n.notificationId === notificationId);
      if (notification && notification.status !== 'READ') {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      console.error('Error dismissing notification:', err);
      throw err;
    }
  }, [notifications]);

  // Refresh
  const refresh = useCallback(() => {
    setCursor(null);
    return loadNotifications(true);
  }, [loadNotifications]);

  // Load more
  const loadMore = useCallback(() => {
    if (!loading && hasMore && cursor) {
      return loadNotifications(false);
    }
  }, [loading, hasMore, cursor, loadNotifications]);

  // Get deep link for notification
  const getDeepLink = useCallback((notification: Notification) => {
    return getNotificationDeepLink(notification);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    hasMore,
    markAsRead,
    markAllRead,
    dismiss,
    refresh,
    loadMore,
    getDeepLink,
  };
}

// ============================================================================
// NOTIFICATION SETTINGS HOOK
// ============================================================================

export function usePack293NotificationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getNotificationSettings();
        setSettings(data);
      } catch (err: any) {
        console.error('Error loading notification settings:', err);
        setError(err.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  // Update settings helper
  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      if (!settings) return;

      try {
        setSaving(true);
        setError(null);

        await updateNotificationSettings(updates);
        
        setSettings(prev => ({
          ...prev!,
          ...updates,
          updatedAt: new Date(),
        }));
      } catch (err: any) {
        console.error('Error updating notification settings:', err);
        setError(err.message || 'Failed to update settings');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [settings]
  );

  // Toggle master switches
  const togglePush = useCallback(() => {
    if (!settings) return;
    return updateSettings({ pushEnabled: !settings.pushEnabled });
  }, [settings, updateSettings]);

  const toggleEmail = useCallback(() => {
    if (!settings) return;
    return updateSettings({ emailEnabled: !settings.emailEnabled });
  }, [settings, updateSettings]);

  const toggleInApp = useCallback(() => {
    if (!settings) return;
    return updateSettings({ inAppEnabled: !settings.inAppEnabled });
  }, [settings, updateSettings]);

  // Toggle channel settings
  const toggleChannel = useCallback(
    (channel: keyof NotificationSettings['channels'], method: 'push' | 'inApp' | 'email') => {
      if (!settings) return;
      
      return updateSettings({
        channels: {
          ...settings.channels,
          [channel]: {
            ...settings.channels[channel],
            [method]: !settings.channels[channel][method],
          },
        },
      });
    },
    [settings, updateSettings]
  );

  // Update quiet hours
  const updateQuietHours = useCallback(
    (quietHours: NotificationSettings['quietHours']) => {
      return updateSettings({ quietHours });
    },
    [updateSettings]
  );

  return {
    settings,
    loading,
    saving,
    error,
    togglePush,
    toggleEmail,
    toggleInApp,
    toggleChannel,
    updateQuietHours,
    updateSettings,
  };
}

// ============================================================================
// UNREAD COUNT HOOK (for badge display)
// ============================================================================

export function useNotificationUnreadCount() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    // Subscribe to notifications and track unread count
    const unsubscribe = subscribeToNotifications(
      user.uid,
      async () => {
        // Fetch latest unread count when any notification changes
        try {
          const result = await getNotifications(undefined, 1);
          setUnreadCount(result.unreadCount);
        } catch (err) {
          console.error('Error fetching unread count:', err);
        }
      }
    );

    // Initial fetch
    getNotifications(undefined, 1)
      .then(result => setUnreadCount(result.unreadCount))
      .catch(err => console.error('Error fetching initial unread count:', err));

    return unsubscribe;
  }, [user]);

  return unreadCount;
}