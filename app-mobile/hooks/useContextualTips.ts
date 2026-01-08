/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Hook for managing contextual tips within screens
 */

import { useState, useEffect, useCallback } from 'react';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { CONTEXTUAL_TIPS, ContextualTip } from '@/config/onboarding';

interface UseContextualTipsResult {
  tips: ContextualTip[];
  loading: boolean;
  dismissTip: (tipId: string) => Promise<void>;
}

/**
 * Hook to get contextual tips for a specific screen
 * Filters out tips that have been dismissed
 */
export function useContextualTips(screenId: string): UseContextualTipsResult {
  const [dismissedTipIds, setDismissedTipIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Load dismissed tips state on mount
  useEffect(() => {
    loadDismissedTips();
  }, []);

  const loadDismissedTips = async () => {
    try {
      setLoading(true);
      const getUserTipsState = httpsCallable(functions, 'help_getUserTipsState');
      const result = await getUserTipsState({});
      const data = result.data as { dismissedTips: string[] };
      setDismissedTipIds(data.dismissedTips || []);
    } catch (error) {
      console.error('[useContextualTips] Error loading dismissed tips:', error);
      setDismissedTipIds([]);
    } finally {
      setLoading(false);
    }
  };

  const dismissTip = useCallback(async (tipId: string) => {
    try {
      // Optimistically update local state
      setDismissedTipIds((prev) => [...prev, tipId]);

      // Update backend
      const dismissTipFn = httpsCallable(functions, 'help_dismissTip');
      await dismissTipFn({ tipId });
    } catch (error) {
      console.error('[useContextualTips] Error dismissing tip:', error);
      // Revert optimistic update on error
      setDismissedTipIds((prev) => prev.filter((id) => id !== tipId));
      throw error;
    }
  }, []);

  // Filter tips for current screen that haven't been dismissed
  const tips = CONTEXTUAL_TIPS.filter(
    (tip) => tip.screen === screenId && !dismissedTipIds.includes(tip.id)
  );

  return { tips, loading, dismissTip };
}