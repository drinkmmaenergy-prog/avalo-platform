/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * React Hook for 2FA Settings Management
 */

import { useState, useEffect, useCallback } from 'react';
import * as twoFactorService from '@/services/twoFactorService';
import type { TwoFactorSettings } from '@/types/twoFactor';

export interface UseTwoFactorSettingsResult {
  settings: TwoFactorSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  enable2FA: (deliveryAddress: string) => Promise<void>;
  disable2FA: () => Promise<void>;
  enableLoading: boolean;
  disableLoading: boolean;
}

/**
 * Hook to manage user's 2FA settings
 */
export function useTwoFactorSettings(): UseTwoFactorSettingsResult {
  const [settings, setSettings] = useState<TwoFactorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enableLoading, setEnableLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);

  /**
   * Load 2FA settings
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await twoFactorService.get2FASettings();
      setSettings(data);
    } catch (err: any) {
      console.error('[useTwoFactorSettings] Error loading settings:', err);
      setError(err.message || 'Failed to load 2FA settings');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Enable 2FA
   */
  const enable2FA = useCallback(async (deliveryAddress: string) => {
    try {
      setEnableLoading(true);
      setError(null);
      
      await twoFactorService.enable2FA('EMAIL_OTP', deliveryAddress);
      
      // Reload settings to reflect changes
      await loadSettings();
    } catch (err: any) {
      console.error('[useTwoFactorSettings] Error enabling 2FA:', err);
      setError(err.message || 'Failed to enable 2FA');
      throw err;
    } finally {
      setEnableLoading(false);
    }
  }, [loadSettings]);

  /**
   * Disable 2FA
   * NOTE: Step-up verification should be completed BEFORE calling this
   */
  const disable2FA = useCallback(async () => {
    try {
      setDisableLoading(true);
      setError(null);
      
      await twoFactorService.disable2FA();
      
      // Reload settings to reflect changes
      await loadSettings();
    } catch (err: any) {
      console.error('[useTwoFactorSettings] Error disabling 2FA:', err);
      setError(err.message || 'Failed to disable 2FA');
      throw err;
    } finally {
      setDisableLoading(false);
    }
  }, [loadSettings]);

  /**
   * Refresh settings
   */
  const refresh = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  // Load on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    refresh,
    enable2FA,
    disable2FA,
    enableLoading,
    disableLoading,
  };
}