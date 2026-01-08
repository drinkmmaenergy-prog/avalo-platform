/**
 * PACK 95 — useSessions Hook
 * React hook for managing user sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { sessionSecurityService, SessionInfo } from '@/services/sessionSecurityService';

export interface UseSessionsResult {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logoutSession: (sessionId: string) => Promise<void>;
  logoutAll: (exceptCurrent?: boolean) => Promise<void>;
  logoutAllLoading: boolean;
}

/**
 * Hook for managing user sessions
 */
export function useSessions(userId?: string): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [logoutAllLoading, setLogoutAllLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch active sessions
   */
  const fetchSessions = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fetchedSessions = await sessionSecurityService.getActiveSessions();
      setSessions(fetchedSessions);
    } catch (err: any) {
      console.error('[useSessions] Error fetching sessions:', err);
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Refresh sessions
   */
  const refresh = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

  /**
   * Logout from a specific session
   */
  const logoutSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      await sessionSecurityService.logoutSession(sessionId);
      // Refresh sessions list
      await fetchSessions();
    } catch (err: any) {
      console.error('[useSessions] Error logging out session:', err);
      setError(err.message || 'Failed to logout session');
      throw err;
    }
  }, [fetchSessions]);

  /**
   * Logout from all sessions
   */
  const logoutAll = useCallback(async (exceptCurrent: boolean = false) => {
    try {
      setLogoutAllLoading(true);
      setError(null);
      await sessionSecurityService.logoutAllSessions(exceptCurrent);
      // Refresh sessions list
      await fetchSessions();
    } catch (err: any) {
      console.error('[useSessions] Error logging out all sessions:', err);
      setError(err.message || 'Failed to logout all sessions');
      throw err;
    } finally {
      setLogoutAllLoading(false);
    }
  }, [fetchSessions]);

  // Fetch sessions on mount and when userId changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    refresh,
    logoutSession,
    logoutAll,
    logoutAllLoading,
  };
}