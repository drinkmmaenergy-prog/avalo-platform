/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * React Hook for Step-Up Verification in Sensitive Flows
 * 
 * This hook provides a reusable pattern for integrating step-up verification
 * into any sensitive flow (payouts, KYC, etc.)
 */

import { useState, useCallback } from 'react';
import * as twoFactorService from '@/services/twoFactorService';
import type { SensitiveAction } from '@/types/twoFactor';

export interface UseStepUpVerificationResult {
  // State
  showVerificationModal: boolean;
  verificationAction: SensitiveAction | null;
  verificationReasonCodes: string[];
  
  // Methods
  executeWithStepUp: <T>(
    action: SensitiveAction,
    fn: () => Promise<T>
  ) => Promise<T>;
  handleVerificationSuccess: () => void;
  handleVerificationCancel: () => void;
}

/**
 * Hook to handle step-up verification for sensitive actions
 * 
 * Usage:
 * ```typescript
 * const stepUp = useStepUpVerification();
 * 
 * const handleCreatePayout = async () => {
 *   await stepUp.executeWithStepUp('PAYOUT_REQUEST_CREATE', async () => {
 *     await createPayoutRequest(tokens);
 *   });
 * };
 * 
 * // In JSX:
 * <StepUpVerificationModal
 *   visible={stepUp.showVerificationModal}
 *   action={stepUp.verificationAction!}
 *   reasonCodes={stepUp.verificationReasonCodes}
 *   onSuccess={stepUp.handleVerificationSuccess}
 *   onCancel={stepUp.handleVerificationCancel}
 * />
 * ```
 */
export function useStepUpVerification(): UseStepUpVerificationResult {
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationAction, setVerificationAction] = useState<SensitiveAction | null>(null);
  const [verificationReasonCodes, setVerificationReasonCodes] = useState<string[]>([]);
  const [pendingFunction, setPendingFunction] = useState<(() => Promise<any>) | null>(null);

  /**
   * Execute a function with step-up verification if required
   * If step-up is not required, executes immediately
   * If step-up is required, shows verification modal first
   */
  const executeWithStepUp = useCallback(
    async <T,>(action: SensitiveAction, fn: () => Promise<T>): Promise<T> => {
      try {
        // Try to execute directly first
        const result = await fn();
        return result;
      } catch (error: any) {
        // Check if this is a step-up requirement error
        if (twoFactorService.isStepUpRequiredError(error)) {
          // Extract action and reason codes
          const errorAction = twoFactorService.getActionFromStepUpError(error);
          const reasonCodes = twoFactorService.getReasonCodesFromStepUpError(error);
          
          // Store the function to execute after verification
          setPendingFunction(() => fn);
          
          // Show verification modal
          setVerificationAction(errorAction || action);
          setVerificationReasonCodes(reasonCodes);
          setShowVerificationModal(true);
          
          // Return a rejected promise (caller should handle this)
          throw new Error('STEP_UP_REQUIRED');
        }
        
        // Re-throw other errors
        throw error;
      }
    },
    []
  );

  /**
   * Handle successful verification
   * Executes the pending function after verification succeeds
   */
  const handleVerificationSuccess = useCallback(async () => {
    setShowVerificationModal(false);
    
    // Execute the pending function if it exists
    if (pendingFunction) {
      try {
        await pendingFunction();
        // Success! Clear pending function
        setPendingFunction(null);
        setVerificationAction(null);
        setVerificationReasonCodes([]);
      } catch (error: any) {
        // Clear state even on error
        setPendingFunction(null);
        setVerificationAction(null);
        setVerificationReasonCodes([]);
        
        // Re-throw error for caller to handle
        throw error;
      }
    }
  }, [pendingFunction]);

  /**
   * Handle verification cancellation
   */
  const handleVerificationCancel = useCallback(() => {
    setShowVerificationModal(false);
    setPendingFunction(null);
    setVerificationAction(null);
    setVerificationReasonCodes([]);
  }, []);

  return {
    showVerificationModal,
    verificationAction,
    verificationReasonCodes,
    executeWithStepUp,
    handleVerificationSuccess,
    handleVerificationCancel,
  };
}