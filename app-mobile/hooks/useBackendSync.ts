/**
 * PACK 44 — Backend Sync Hook
 * 
 * React hook to manage backend sync lifecycle:
 * - Starts retry scheduler on mount
 * - Triggers sync when chat screen opens
 * - Cleans up on unmount
 */

import { useEffect } from 'react';
import { 
  startRetryScheduler, 
  stopRetryScheduler, 
  triggerSync 
} from '../services/backSyncService';

interface UseBackendSyncOptions {
  userId: string;
  enabled?: boolean;
  triggerOnMount?: boolean;
}

/**
 * Hook to manage backend sync for a user
 * 
 * Usage in App.tsx (root level):
 * ```
 * const { user } = useAuth();
 * useBackendSync({ userId: user?.uid || '', enabled: !!user });
 * ```
 * 
 * Usage in chat screen (to trigger sync when opening chat):
 * ```
 * useBackendSync({ 
 *   userId: currentUserId, 
 *   enabled: true,
 *   triggerOnMount: true 
 * });
 * ```
 */
export function useBackendSync(options: UseBackendSyncOptions): void {
  const { userId, enabled = true, triggerOnMount = false } = options;
  
  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    
    // Start the retry scheduler (60s periodic timer)
    startRetryScheduler(userId);
    
    // Optionally trigger immediate sync (e.g., when chat screen opens)
    if (triggerOnMount) {
      triggerSync(userId).catch(err => {
        console.error('[useBackendSync] Error in mount sync:', err);
      });
    }
    
    // Cleanup: stop scheduler when component unmounts or userId changes
    return () => {
      stopRetryScheduler();
    };
  }, [userId, enabled, triggerOnMount]);
}

export default useBackendSync;