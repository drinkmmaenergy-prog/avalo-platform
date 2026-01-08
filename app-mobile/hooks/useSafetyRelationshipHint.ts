/**
 * PACK 74 — Use Safety Relationship Hint Hook
 * 
 * React hook for loading and managing relationship risk hints in chat screens
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getRelationshipRiskHint,
  logSafetyAction,
  RiskLevel,
  RiskSignal,
  SafetyAction,
} from '../services/safetyRelationshipService';

// ============================================================================
// TYPES
// ============================================================================

interface UseSafetyRelationshipHintResult {
  level: RiskLevel;
  signals: RiskSignal[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  logAction: (action: SafetyAction, notes?: string) => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for loading and managing relationship risk hints
 * 
 * @param counterpartUserId - User ID to assess
 * @param enabled - Whether to load the hint (default: true)
 * @returns Risk level, signals, and action logging function
 */
export function useSafetyRelationshipHint(
  counterpartUserId: string | null | undefined,
  enabled: boolean = true
): UseSafetyRelationshipHintResult {
  const [level, setLevel] = useState<RiskLevel>('NONE');
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [warningLogged, setWarningLogged] = useState<boolean>(false);

  // Load risk hint
  const loadHint = useCallback(async () => {
    if (!counterpartUserId || !enabled) {
      setLevel('NONE');
      setSignals([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const hint = await getRelationshipRiskHint(counterpartUserId);
      setLevel(hint.level);
      setSignals(hint.signals);

      // Auto-log warning if shown for the first time
      if (hint.level !== 'NONE' && !warningLogged) {
        await logSafetyAction(counterpartUserId, 'OPENED_WARNING');
        setWarningLogged(true);
      }
    } catch (err) {
      console.error('[useSafetyRelationshipHint] Error loading hint:', err);
      setError(err as Error);
      // Fail-safe: Set to NONE on error
      setLevel('NONE');
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [counterpartUserId, enabled, warningLogged]);

  // Load hint on mount and when dependencies change
  useEffect(() => {
    loadHint();
  }, [loadHint]);

  // Function to log safety actions
  const logAction = useCallback(
    async (action: SafetyAction, notes?: string) => {
      if (!counterpartUserId) {
        console.warn('[useSafetyRelationshipHint] Cannot log action: no counterpartUserId');
        return;
      }

      try {
        await logSafetyAction(counterpartUserId, action, notes);
      } catch (err) {
        console.error('[useSafetyRelationshipHint] Error logging action:', err);
      }
    },
    [counterpartUserId]
  );

  return {
    level,
    signals,
    loading,
    error,
    refresh: loadHint,
    logAction,
  };
}

export default useSafetyRelationshipHint;