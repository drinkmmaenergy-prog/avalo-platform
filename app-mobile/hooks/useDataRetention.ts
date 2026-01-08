/**
 * PACK 155: Data Retention Compliance Hooks
 * React hooks for GDPR/CCPA/LGPD/PDPA compliance
 */

import { useState, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '@/lib/firebase';

interface RetentionSummary {
  userId: string;
  categories: {
    category: string;
    itemCount: number;
    oldestItem: string;
    scheduledDeletionDate?: string;
    retentionPolicy: {
      category: string;
      retentionMonths: number | null;
      deleteLogic: string;
      description: string;
    };
  }[];
  hasLegalHold: boolean;
}

interface ConsentSettings {
  locationTracking: boolean;
  analyticsData: boolean;
  emailMarketing: boolean;
  pushNotifications: boolean;
  cookieConsent: boolean;
  personalization: boolean;
  thirdPartySharing: boolean;
  updatedAt?: string;
}

interface ExportRequest {
  id: string;
  status: string;
  requestedAt: string;
  downloadUrl?: string;
  downloadExpiresAt?: string;
  fileSize?: number;
  error?: string;
}

interface DeletionRequest {
  id: string;
  status: string;
  requestedAt: string;
  accountFrozenAt?: string;
  completedAt?: string;
  legalHoldReason?: string;
  deletionSteps: {
    step: string;
    description: string;
    status: 'pending' | 'completed' | 'failed';
    completedAt?: string;
    error?: string;
  }[];
}

/**
 * Hook for managing data retention summary
 */
export function useRetentionSummary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RetentionSummary | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const getRetentionSummary = httpsCallable(functions, 'getRetentionSummary');
      const result = await getRetentionSummary();

      setSummary(result.data as RetentionSummary);
    } catch (err) {
      console.error('Error loading retention summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to load retention summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      loadSummary();
    }
  }, [loadSummary]);

  return {
    loading,
    error,
    summary,
    refresh: loadSummary
  };
}

/**
 * Hook for managing user consent settings
 */
export function useConsentSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConsentSettings | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const getConsentSettings = httpsCallable(functions, 'getConsentSettings');
      const result = await getConsentSettings();

      setSettings(result.data as ConsentSettings);
    } catch (err) {
      console.error('Error loading consent settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load consent settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<ConsentSettings>) => {
    try {
      setLoading(true);
      setError(null);

      const updateConsent = httpsCallable(functions, 'updateConsentSettings');
      await updateConsent(newSettings);

      setSettings(prev => prev ? { ...prev, ...newSettings } : null);
    } catch (err) {
      console.error('Error updating consent settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update consent settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      loadSettings();
    }
  }, [loadSettings]);

  return {
    loading,
    error,
    settings,
    updateSettings,
    refresh: loadSettings
  };
}

/**
 * Hook for managing data export requests
 */
export function useDataExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null);

  const checkExistingRequest = useCallback(async () => {
    try {
      const getExportRequest = httpsCallable(functions, 'getLatestExportRequest');
      const result = await getExportRequest();

      if (result.data) {
        setExportRequest(result.data as ExportRequest);
      }
    } catch (err) {
      console.error('Error checking export request:', err);
    }
  }, []);

  const requestExport = useCallback(async (categories: string[]) => {
    try {
      setLoading(true);
      setError(null);

      const generateExport = httpsCallable(functions, 'requestDataExport');
      const result = await generateExport({ categories });

      await checkExistingRequest();
      
      return result.data;
    } catch (err) {
      console.error('Error requesting export:', err);
      setError(err instanceof Error ? err.message : 'Failed to request export');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [checkExistingRequest]);

  const markDownloaded = useCallback(async (exportRequestId: string) => {
    try {
      const markExportDownloaded = httpsCallable(functions, 'markExportDownloaded');
      await markExportDownloaded({ exportRequestId });

      await checkExistingRequest();
    } catch (err) {
      console.error('Error marking export as downloaded:', err);
      throw err;
    }
  }, [checkExistingRequest]);

  useEffect(() => {
    if (auth.currentUser) {
      checkExistingRequest();
    }
  }, [checkExistingRequest]);

  return {
    loading,
    error,
    exportRequest,
    requestExport,
    markDownloaded,
    refresh: checkExistingRequest
  };
}

/**
 * Hook for managing account deletion
 */
export function useAccountDeletion() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);

  const checkDeletionStatus = useCallback(async () => {
    try {
      const getDeletionRequest = httpsCallable(functions, 'getDeletionRequestStatus');
      const result = await getDeletionRequest();

      if (result.data) {
        setDeletionRequest(result.data as DeletionRequest);
      }
    } catch (err) {
      console.error('Error checking deletion status:', err);
    }
  }, []);

  const requestDeletion = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
      const result = await requestAccountDeletion();

      await checkDeletionStatus();
      
      return result.data;
    } catch (err) {
      console.error('Error requesting deletion:', err);
      setError(err instanceof Error ? err.message : 'Failed to request deletion');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [checkDeletionStatus]);

  const cancelDeletion = useCallback(async (deletionRequestId: string) => {
    try {
      setLoading(true);
      setError(null);

      const cancelAccountDeletion = httpsCallable(functions, 'cancelAccountDeletion');
      await cancelAccountDeletion({ deletionRequestId });

      setDeletionRequest(null);
    } catch (err) {
      console.error('Error cancelling deletion:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel deletion');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      checkDeletionStatus();
    }
  }, [checkDeletionStatus]);

  return {
    loading,
    error,
    deletionRequest,
    requestDeletion,
    cancelDeletion,
    refresh: checkDeletionStatus
  };
}

/**
 * Hook for privacy action logs
 */
export function usePrivacyLogs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = useCallback(async (limit: number = 50) => {
    try {
      setLoading(true);
      setError(null);

      const getPrivacyLogs = httpsCallable(functions, 'getPrivacyActionLogs');
      const result = await getPrivacyLogs({ limit });

      setLogs(result.data as any[]);
    } catch (err) {
      console.error('Error loading privacy logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load privacy logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      loadLogs();
    }
  }, [loadLogs]);

  return {
    loading,
    error,
    logs,
    refresh: loadLogs
  };
}

/**
 * Combined compliance hook providing all privacy functionality
 */
export function usePrivacyCompliance() {
  const retention = useRetentionSummary();
  const consent = useConsentSettings();
  const exportData = useDataExport();
  const deletion = useAccountDeletion();

  return {
    retention,
    consent,
    export: exportData,
    deletion,
    isLoading: retention.loading || consent.loading || exportData.loading || deletion.loading,
    hasError: !!(retention.error || consent.error || exportData.error || deletion.error)
  };
}