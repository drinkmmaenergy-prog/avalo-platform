/**
 * useAccountDeletion Hook
 * React hook for managing account deletion requests
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getMyDeletionStatus,
  requestAccountDeletion,
  DeletionRequest,
  RequestAccountDeletionResponse,
} from '@/services/dataRightsService';

interface UseAccountDeletionReturn {
  deletionRequest: DeletionRequest | null;
  hasPendingDeletion: boolean;
  isLoading: boolean;
  error: string | null;
  requestDeletion: (confirmationText: string, reason?: string) => Promise<RequestAccountDeletionResponse>;
  refreshStatus: () => Promise<void>;
}

/**
 * Hook for managing account deletion
 * Fetches and manages user's deletion request status
 */
export function useAccountDeletion(userId: string | null): UseAccountDeletionReturn {
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [hasPendingDeletion, setHasPendingDeletion] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setDeletionRequest(null);
      setHasPendingDeletion(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getMyDeletionStatus();
      
      if (result.success) {
        setHasPendingDeletion(result.hasPendingDeletion);
        setDeletionRequest(result.request || null);
      } else {
        setError('Failed to load deletion status');
      }
    } catch (err: any) {
      console.error('[useAccountDeletion] Error fetching status:', err);
      setError(err.message || 'An error occurred while loading deletion status');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const requestDeletion = useCallback(async (
    confirmationText: string,
    reason?: string
  ): Promise<RequestAccountDeletionResponse> => {
    setError(null);
    
    try {
      const result = await requestAccountDeletion(confirmationText, reason);
      
      if (result.success) {
        // Refresh the status after a short delay
        setTimeout(() => {
          fetchStatus();
        }, 1000);
      }
      
      return result;
    } catch (err: any) {
      console.error('[useAccountDeletion] Error requesting deletion:', err);
      return {
        success: false,
        message: err.message || 'Failed to request account deletion',
        error: err.message,
      };
    }
  }, [fetchStatus]);

  const refreshStatus = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (userId) {
      fetchStatus();
    }
  }, [userId, fetchStatus]);

  return {
    deletionRequest,
    hasPendingDeletion,
    isLoading,
    error,
    requestDeletion,
    refreshStatus,
  };
}