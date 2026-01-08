/**
 * PACK 84 — KYC React Hooks
 * Custom hooks for KYC operations
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  KycStatusResponse,
  KycDocumentResponse,
  KycApplicationFormData,
} from '../types/kyc';
import {
  getKycStatus,
  getKycDocuments,
  submitKycApplication,
  canRequestPayout,
} from '../services/kycService';

/**
 * Hook to manage KYC status
 */
export function useKycStatus(userId: string | undefined) {
  const [status, setStatus] = useState<KycStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getKycStatus(userId);
      setStatus(data);
    } catch (err: any) {
      console.error('Error fetching KYC status:', err);
      setError(err.message || 'Failed to load KYC status');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const refresh = useCallback(() => {
    return fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    error,
    refresh,
    canRequestPayout: status ? canRequestPayout(status) : { canRequest: false },
  };
}

/**
 * Hook to manage KYC documents
 */
export function useKycDocuments(userId: string | undefined) {
  const [documents, setDocuments] = useState<KycDocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getKycDocuments(userId);
      setDocuments(data);
    } catch (err: any) {
      console.error('Error fetching KYC documents:', err);
      setError(err.message || 'Failed to load KYC documents');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const refresh = useCallback(() => {
    return fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Hook to submit KYC application
 */
export function useKycSubmission(userId: string | undefined) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(
    async (formData: KycApplicationFormData) => {
      if (!userId) {
        setError('User not authenticated');
        return { success: false };
      }

      try {
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);

        const result = await submitKycApplication(userId, formData);
        setSuccess(true);

        return { success: true, data: result };
      } catch (err: any) {
        console.error('Error submitting KYC:', err);
        const errorMessage = err.message || 'Failed to submit KYC application';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsSubmitting(false);
      }
    },
    [userId]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    submit,
    isSubmitting,
    error,
    success,
    reset,
  };
}

/**
 * Combined hook for complete KYC workflow
 */
export function useKyc(userId: string | undefined) {
  const statusHook = useKycStatus(userId);
  const documentsHook = useKycDocuments(userId);
  const submissionHook = useKycSubmission(userId);

  const refreshAll = useCallback(async () => {
    await Promise.all([statusHook.refresh(), documentsHook.refresh()]);
  }, [statusHook, documentsHook]);

  return {
    // Status
    status: statusHook.status,
    isLoadingStatus: statusHook.isLoading,
    statusError: statusHook.error,
    canRequestPayout: statusHook.canRequestPayout,

    // Documents
    documents: documentsHook.documents,
    isLoadingDocuments: documentsHook.isLoading,
    documentsError: documentsHook.error,

    // Submission
    submitApplication: submissionHook.submit,
    isSubmitting: submissionHook.isSubmitting,
    submissionError: submissionHook.error,
    submissionSuccess: submissionHook.success,
    resetSubmission: submissionHook.reset,

    // General
    refresh: refreshAll,
    isLoading: statusHook.isLoading || documentsHook.isLoading,
    error: statusHook.error || documentsHook.error,
  };
}

/**
 * Hook to check if KYC verification is required for payout
 * Can be used to gate payout-related UI
 */
export function useKycRequired(userId: string | undefined): {
  isRequired: boolean;
  isVerified: boolean;
  isLoading: boolean;
  status: KycStatusResponse | null;
} {
  const { status, isLoading } = useKycStatus(userId);

  return {
    isRequired: status ? status.status !== 'VERIFIED' : true,
    isVerified: status ? status.status === 'VERIFIED' : false,
    isLoading,
    status,
  };
}