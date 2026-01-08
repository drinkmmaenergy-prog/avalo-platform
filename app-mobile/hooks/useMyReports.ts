/**
 * PACK 86 - useMyReports Hook
 * React hook for managing user's transaction issue reports
 */

import { useState, useEffect, useCallback } from 'react';
import { getMyTransactionIssues } from '../services/disputeService';
import { TransactionIssue } from '../types/dispute.types';

interface UseMyReportsState {
  issues: TransactionIssue[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage user's transaction issues
 * 
 * @returns State object with issues, loading, error, and refresh function
 */
export function useMyReports(): UseMyReportsState {
  const [issues, setIssues] = useState<TransactionIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const fetchedIssues = await getMyTransactionIssues();
      setIssues(fetchedIssues);
    } catch (err: any) {
      console.error('[useMyReports] Error loading issues:', err);
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  return {
    issues,
    loading,
    error,
    refresh,
  };
}