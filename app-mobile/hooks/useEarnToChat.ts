/**
 * PACK 3.2 — useEarnToChat Hook
 * 
 * Hook for Earn-to-Chat state management.
 * - Reads earnFromChat mode from Firestore (READ-ONLY)
 * - Toggle calls backend function
 * - No client-side business logic
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface EarnToChatState {
  enabled: boolean;
  loading: boolean;
  error: string | null;
}

export interface UseEarnToChatReturn extends EarnToChatState {
  toggle: (enabled: boolean) => Promise<boolean>;
  canReceivePaidMessages: boolean;
}

/**
 * Hook for Earn-to-Chat functionality
 * 
 * Usage:
 * ```tsx
 * const { enabled, loading, toggle, canReceivePaidMessages } = useEarnToChat();
 * 
 * // Toggle via backend
 * await toggle(true);
 * 
 * // Check state (read-only)
 * if (canReceivePaidMessages) {
 *   // Show earnings UI
 * }
 * ```
 */
export function useEarnToChat(): UseEarnToChatReturn {
  const { user } = useAuth();
  
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Subscribe to user's earnFromChat mode (READ-ONLY)
  useEffect(() => {
    if (!user?.uid) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const earnMode = data.modes?.earnFromChat ?? false;
          setEnabled(earnMode);
        } else {
          setEnabled(false);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useEarnToChat] Subscription error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, [user?.uid]);
  
  // Toggle Earn-to-Chat (calls backend)
  const toggle = useCallback(async (newEnabled: boolean): Promise<boolean> => {
    if (!user?.uid) {
      return false;
    }
    
    try {
      const updateSettings = httpsCallable<
        { [key: string]: unknown },
        { success: boolean }
      >(functions, 'updateSettings');
      
      const result = await updateSettings({
        'modes.earnFromChat': newEnabled,
      });
      
      // State will update automatically via Firestore subscription
      return result.data.success;
    } catch (err: any) {
      console.error('[useEarnToChat] Toggle error:', err);
      setError(err.message);
      return false;
    }
  }, [user?.uid]);
  
  return {
    enabled,
    loading,
    error,
    toggle,
    canReceivePaidMessages: enabled && !loading,
  };
}

export default useEarnToChat;
