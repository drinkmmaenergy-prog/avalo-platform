/**
 * PACK 92 — Notification Settings Hook
 * React hook for managing notification settings
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserNotificationSettings,
  getNotificationSettings,
  updateNotificationSettings,
} from '../services/notificationService';

export function useNotificationSettings() {
  const [settings, setSettings] = useState<UserNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getNotificationSettings();
      setSettings(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<UserNotificationSettings>) => {
      setSaving(true);
      setError(null);

      try {
        await updateNotificationSettings(updates);
        setSettings((prev) => (prev ? { ...prev, ...updates } : null));
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  // Toggle specific setting
  const togglePush = useCallback(async () => {
    if (!settings) return;
    await updateSettings({ pushEnabled: !settings.pushEnabled });
  }, [settings, updateSettings]);

  const toggleEmail = useCallback(async () => {
    if (!settings) return;
    await updateSettings({ emailEnabled: !settings.emailEnabled });
  }, [settings, updateSettings]);

  const toggleInApp = useCallback(async () => {
    if (!settings) return;
    await updateSettings({ inAppEnabled: !settings.inAppEnabled });
  }, [settings, updateSettings]);

  const toggleCategory = useCallback(
    async (category: keyof UserNotificationSettings['categories']) => {
      if (!settings) return;
      
      // Prevent disabling mandatory categories
      if (category === 'LEGAL' || category === 'SAFETY') {
        return;
      }

      await updateSettings({
        categories: {
          ...settings.categories,
          [category]: !settings.categories[category],
        },
      });
    },
    [settings, updateSettings]
  );

  return {
    settings,
    loading,
    error,
    saving,
    updateSettings,
    togglePush,
    toggleEmail,
    toggleInApp,
    toggleCategory,
    refresh: loadSettings,
  };
}