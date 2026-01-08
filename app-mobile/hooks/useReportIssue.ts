/**
 * PACK 86 - useReportIssue Hook
 * React hook for submitting transaction issue reports
 */

import { useState, useCallback } from 'react';
import { createTransactionIssue } from '../services/disputeService';
import {
  CreateTransactionIssueInput,
  CreateTransactionIssueResult,
} from '../types/dispute.types';

interface UseReportIssueState {
  submitting: boolean;
  error: string | null;
  success: boolean;
  result: CreateTransactionIssueResult | null;
  submitReport: (input: CreateTransactionIssueInput) => Promise<CreateTransactionIssueResult>;
  reset: () => void;
}

/**
 * Hook to submit transaction issue reports
 * 
 * @returns State object with submitting status, error, success, and submit function
 */
export function useReportIssue(): UseReportIssueState {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<CreateTransactionIssueResult | null>(null);

  const submitReport = useCallback(
    async (input: CreateTransactionIssueInput): Promise<CreateTransactionIssueResult> => {
      try {
        setSubmitting(true);
        setError(null);
        setSuccess(false);
        setResult(null);

        const reportResult = await createTransactionIssue(input);
        
        setResult(reportResult);
        setSuccess(true);
        
        return reportResult;
      } catch (err: any) {
        console.error('[useReportIssue] Error submitting report:', err);
        const errorMessage = err.message || 'Failed to submit report. Please try again.';
        setError(errorMessage);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setSubmitting(false);
    setError(null);
    setSuccess(false);
    setResult(null);
  }, []);

  return {
    submitting,
    error,
    success,
    result,
    submitReport,
    reset,
  };
}