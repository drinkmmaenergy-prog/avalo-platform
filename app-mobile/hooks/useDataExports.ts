/**
 * useDataExports Hook
 * React hook for managing data export requests
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getMyDataExports,
  requestDataExport,
  downloadDataExport,
  DataExportRequest,
  RequestDataExportResponse,
} from '@/services/dataRightsService';

interface UseDataExportsReturn {
  exports: DataExportRequest[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  requestExport: () => Promise<RequestDataExportResponse>;
  refreshExports: () => Promise<void>;
  downloadExport: (downloadUrl: string) => void;
}

/**
 * Hook for managing data exports
 * Fetches and manages user's data export requests
 */
export function useDataExports(userId: string | null): UseDataExportsReturn {
  const [exports, setExports] = useState<DataExportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async (showLoading: boolean = true) => {
    if (!userId) {
      setExports([]);
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    
    setError(null);

    try {
      const result = await getMyDataExports();
      
      if (result.success) {
        setExports(result.exports);
      } else {
        setError('Failed to load data exports');
      }
    } catch (err: any) {
      console.error('[useDataExports] Error fetching exports:', err);
      setError(err.message || 'An error occurred while loading exports');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId]);

  const requestExport = useCallback(async (): Promise<RequestDataExportResponse> => {
    setError(null);
    
    try {
      const result = await requestDataExport();
      
      if (result.success) {
        // Refresh the exports list after a short delay
        setTimeout(() => {
          fetchExports(false);
        }, 1000);
      }
      
      return result;
    } catch (err: any) {
      console.error('[useDataExports] Error requesting export:', err);
      return {
        success: false,
        message: err.message || 'Failed to request data export',
        error: err.message,
      };
    }
  }, [fetchExports]);

  const refreshExports = useCallback(async () => {
    await fetchExports(false);
  }, [fetchExports]);

  const downloadExport = useCallback((downloadUrl: string) => {
    downloadDataExport(downloadUrl);
  }, []);

  useEffect(() => {
    if (userId) {
      fetchExports();
    }
  }, [userId, fetchExports]);

  return {
    exports,
    isLoading,
    isRefreshing,
    error,
    requestExport,
    refreshExports,
    downloadExport,
  };
}