/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Integration Utility for Existing Mobile Flows
 * 
 * This file provides examples and utilities for integrating step-up verification
 * into existing sensitive flows throughout the app.
 */

import React from 'react';
import { Alert } from 'react-native';
import * as twoFactorService from "@/services/twoFactorService";
import type { SensitiveAction } from "@/types/twoFactor";

// ============================================================================
// Step-Up Aware Function Wrapper
// ============================================================================

/**
 * Wrap a sensitive function with step-up verification handling
 * 
 * Usage:
 * ```typescript
 * const wrappedCreatePayout = withStepUpHandling(
 *   'PAYOUT_REQUEST_CREATE',
 *   async () => {
 *     await payoutService.createPayoutRequest(methodId, tokens);
 *   },
 *   () => setShowStepUpModal(true)
 * );
 * 
 * // Then call it:
 * await wrappedCreatePayout();
 * ```
 */
export function withStepUpHandling<T>(
  action: SensitiveAction,
  fn: () => Promise<T>,
  onStepUpRequired: (action: SensitiveAction, reasonCodes: string[]) => void
): () => Promise<T> {
  return async () => {
    try {
      return await fn();
    } catch (error: any) {
      if (twoFactorService.isStepUpRequiredError(error)) {
        const errorAction = twoFactorService.getActionFromStepUpError(error) || action;
        const reasonCodes = twoFactorService.getReasonCodesFromStepUpError(error);
        onStepUpRequired(errorAction, reasonCodes);
        throw new Error('STEP_UP_REQUIRED');
      }
      throw error;
    }
  };
}

// ============================================================================
// Integration Examples for Existing Screens
// ============================================================================

/**
 * EXAMPLE 1: Payout Request Flow Integration
 * 
 * File: app-mobile/app/wallet/create-payout-request.tsx
 * 
 * Add to the component:
 * ```typescript
 * import { StepUpVerificationModal } from "@/app/components/StepUpVerificationModal";
 * import { useStepUpVerification } from "@/app/hooks/useStepUpVerification";
 * 
 * export default function CreatePayoutRequestScreen() {
 *   const stepUp = useStepUpVerification();
 *   
 *   const handleCreateRequest = async () => {
 *     try {
 *       await stepUp.executeWithStepUp('PAYOUT_REQUEST_CREATE', async () => {
 *         const requestId = await payoutService.createPayoutRequest(
 *           user.uid,
 *           selectedMethodId,
 *           tokenAmount
 *         );
 *         // ... handle success
 *       });
 *     } catch (error: any) {
 *       if (error.message !== 'STEP_UP_REQUIRED') {
 *         // Handle other errors
 *         Alert.alert('Error', error.message);
 *       }
 *       // If STEP_UP_REQUIRED, modal is already shown by executeWithStepUp
 *     }
 *   };
 *   
 *   return (
 *     <View>
 *       {// ... existing UI ...}
 *       
 *       <StepUpVerificationModal
 *         visible={stepUp.showVerificationModal}
 *         action={stepUp.verificationAction!}
 *         reasonCodes={stepUp.verificationReasonCodes}
 *         onSuccess={stepUp.handleVerificationSuccess}
 *         onCancel={stepUp.handleVerificationCancel}
 *       />
 *     </View>
 *   );
 * }
 * ```
 */

/**
 * EXAMPLE 2: Payout Method Creation/Update
 * 
 * File: app-mobile/app/wallet/payout-methods.tsx
 * 
 * ```typescript
 * import { useStepUpVerification } from "@/app/hooks/useStepUpVerification";
 * 
 * const stepUp = useStepUpVerification();
 * 
 * const handleSaveMethod = async () => {
 *   try {
 *     const action = editingMethod ? 'PAYOUT_METHOD_UPDATE' : 'PAYOUT_METHOD_CREATE';
 *     
 *     await stepUp.executeWithStepUp(action, async () => {
 *       await payoutService.createPayoutMethod(user.uid, formData);
 *       // ... success handling
 *     });
 *   } catch (error: any) {
 *     if (error.message !== 'STEP_UP_REQUIRED') {
 *       Alert.alert('Error', error.message);
 *     }
 *   }
 * };
 * 
 * // Add modal to JSX
 * <StepUpVerificationModal
 *   visible={stepUp.showVerificationModal}
 *   action={stepUp.verificationAction!}
 *   reasonCodes={stepUp.verificationReasonCodes}
 *   onSuccess={stepUp.handleVerificationSuccess}
 *   onCancel={stepUp.handleVerificationCancel}
 * />
 * ```
 */

/**
 * EXAMPLE 3: KYC Submission
 * 
 * File: app-mobile/app/kyc/submit.tsx or similar
 * 
 * ```typescript
 * import { useStepUpVerification } from "@/app/hooks/useStepUpVerification";
 * 
 * const stepUp = useStepUpVerification();
 * 
 * const handleSubmitKYC = async () => {
 *   try {
 *     await stepUp.executeWithStepUp('KYC_SUBMIT', async () => {
 *       await kycService.submitApplication(documents);
 *       // ... success handling
 *     });
 *   } catch (error: any) {
 *     if (error.message !== 'STEP_UP_REQUIRED') {
 *       Alert.alert('Error', error.message);
 *     }
 *   }
 * };
 * ```
 */

/**
 * EXAMPLE 4: Logout All Sessions
 * 
 * File: app-mobile/app/security/sessions.tsx
 * 
 * ```typescript
 * import { useStepUpVerification } from "@/app/hooks/useStepUpVerification";
 * 
 * const stepUp = useStepUpVerification();
 * 
 * const handleLogoutAll = async () => {
 *   try {
 *     await stepUp.executeWithStepUp('LOGOUT_ALL_SESSIONS', async () => {
 *       await sessionSecurityService.logoutAllSessions(true, currentSessionId);
 *       // ... success handling
 *     });
 *   } catch (error: any) {
 *     if (error.message !== 'STEP_UP_REQUIRED') {
 *       Alert.alert('Error', error.message);
 *     }
 *   }
 * };
 * ```
 */

// ============================================================================
// Simple Alert-Based Integration (Alternative Pattern)
// ============================================================================

/**
 * Simple integration that shows an alert when step-up is required
 * Use this for quick integration without managing modal state
 * 
 * Usage:
 * ```typescript
 * import { executeWithStepUpAlert } from "@/app/utils/stepUpIntegration";
 * 
 * const handleSensitiveAction = async () => {
 *   await executeWithStepUpAlert(
 *     'PAYOUT_REQUEST_CREATE',
 *     async () => {
 *       await createPayoutRequest(tokens);
 *     },
 *     () => {
 *       // On success
 *       navigation.goBack();
 *     },
 *     (error) => {
 *       // On error
 *       Alert.alert('Error', error.message);
 *     }
 *   );
 * };
 * ```
 */
export async function executeWithStepUpAlert<T>(
  action: SensitiveAction,
  fn: () => Promise<T>,
  onSuccess?: (result: T) => void,
  onError?: (error: Error) => void
): Promise<void> {
  try {
    const result = await fn();
    onSuccess?.(result);
  } catch (error: any) {
    if (twoFactorService.isStepUpRequiredError(error)) {
      Alert.alert(
        'Verification Required',
        'This action requires additional verification. Please enable two-factor authentication in Security settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => {
              // Navigate to 2FA settings
              // This would need router/navigation context
            },
          },
        ]
      );
    } else {
      onError?.(error);
    }
  }
}

// ============================================================================
// Utility: Check if Action Requires Step-Up (Before Attempting)
// ============================================================================

/**
 * Pre-check if an action will require step-up verification
 * Useful for showing UI hints before user attempts the action
 * 
 * Note: This is a best-effort check. The authoritative check happens server-side.
 * 
 * Usage:
 * ```typescript
 * const [requiresVerification, setRequiresVerification] = useState(false);
 * 
 * useEffect(() => {
 *   checkIfStepUpRequired('PAYOUT_REQUEST_CREATE').then(setRequiresVerification);
 * }, []);
 * 
 * // Show hint in UI
 * {requiresVerification && (
 *   <Text>This action will require additional verification</Text>
 * )}
 * ```
 */
export async function checkIfStepUpRequired(action: SensitiveAction): Promise<boolean> {
  try {
    // This would call a backend endpoint to check requirement
    // For now, we can't pre-check without actually attempting the action
    // So we return false as a safe default
    return false;
  } catch (error) {
    console.error('[StepUp] Error checking requirement:', error);
    return false;
  }
}
