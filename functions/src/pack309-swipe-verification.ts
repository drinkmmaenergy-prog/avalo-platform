/**
 * PACK 309 — Swipe & Discovery 18+ Verification Enforcement
 * 
 * Adds mandatory 18+ verification checks to swipe and discovery features
 * Integrates with PACK 306 verification system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Check if user meets 18+ verification requirements for Swipe and Discovery
 */
export async function checkSwipeVerificationRequirements(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user's verification status from PACK 306
    const verificationDoc = await db
      .collection('users')
      .doc(userId)
      .collection('verification')
      .doc('status')
      .get();

    if (!verificationDoc.exists) {
      return {
        allowed: false,
        reason: 'VERIFICATION_REQUIRED'
      };
    }

    const verificationData = verificationDoc.data();

    // Check verification status
    if (verificationData?.status !== 'VERIFIED') {
      return {
        allowed: false,
        reason: 'VERIFICATION_NOT_COMPLETE'
      };
    }

    // Check age verification
    if (!verificationData?.ageVerified) {
      return {
        allowed: false,
        reason: 'AGE_NOT_VERIFIED'
      };
    }

    // Check minimum age (18+)
    if ((verificationData?.minAgeConfirmed || 0) < 18) {
      return {
        allowed: false,
        reason: 'UNDER_AGE'
      };
    }

    // All checks passed
    return { allowed: true };
    
  } catch (error) {
    console.error('Error checking verification requirements:', error);
    return {
      allowed: false,
      reason: 'VERIFICATION_CHECK_FAILED'
    };
  }
}

/**
 * Throw appropriate error based on verification status
 */
export function throwVerificationError(reason: string): never {
  const errorMessages: Record<string, string> = {
    VERIFICATION_REQUIRED: 'Identity verification is required to use Swipe and Discovery features',
    VERIFICATION_NOT_COMPLETE: 'Please complete your identity verification to continue',
    AGE_NOT_VERIFIED: 'Age verification is required to access this feature',
    UNDER_AGE: 'You must be 18 or older to use this feature',
    VERIFICATION_CHECK_FAILED: 'Unable to verify your identity status. Please try again.'
  };

  throw new functions.https.HttpsError(
    'permission-denied',
    errorMessages[reason] || 'Verification required',
    { code: reason }
  );
}

/**
 * Get localized verification error messages
 */
export function getVerificationErrorMessage(
  reason: string,
  language: 'en' | 'pl' = 'en'
): { title: string; message: string; action: string } {
  const messages = {
    en: {
      VERIFICATION_REQUIRED: {
        title: 'Verification Required',
        message: 'Identity verification is required to use Swipe and Discovery. This ensures all users are 18+ and helps keep the community safe.',
        action: 'Start Verification'
      },
      VERIFICATION_NOT_COMPLETE: {
        title: 'Complete Verification',
        message: 'Please complete your identity verification to access Swipe and Discovery features.',
        action: 'Continue Verification'
      },
      AGE_NOT_VERIFIED: {
        title: 'Age Verification Required',
        message: 'We need to verify your age to ensure you meet the 18+ requirement.',
        action: 'Verify Age'
      },
      UNDER_AGE: {
        title: 'Age Requirement Not Met',
        message: 'You must be 18 or older to use Swipe and Discovery features.',
        action: 'Contact Support'
      }
    },
    pl: {
      VERIFICATION_REQUIRED: {
        title: 'Wymagana Weryfikacja',
        message: 'Weryfikacja tożsamości jest wymagana do korzystania z Swipe i Discovery. Zapewnia to, że wszyscy użytkownicy mają 18+ lat i pomaga utrzymać bezpieczeństwo społeczności.',
        action: 'Rozpocznij Weryfikację'
      },
      VERIFICATION_NOT_COMPLETE: {
        title: 'Dokończ Weryfikację',
        message: 'Proszę dokończyć weryfikację tożsamości, aby uzyskać dostęp do funkcji Swipe i Discovery.',
        action: 'Kontynuuj Weryfikację'
      },
      AGE_NOT_VERIFIED: {
        title: 'Wymagana Weryfikacja Wieku',
        message: 'Musimy zweryfikować Twój wiek, aby upewnić się, że spełniasz wymóg 18+.',
        action: 'Zweryfikuj Wiek'
      },
      UNDER_AGE: {
        title: 'Wymóg Wieku Niespełniony',
        message: 'Musisz mieć 18 lat lub więcej, aby korzystać z funkcji Swipe i Discovery.',
        action: 'Skontaktuj się z Pomocą'
      }
    }
  };

  const lang = language === 'pl' ? 'pl' : 'en';
  return messages[lang][reason as keyof typeof messages.en] || messages[lang].VERIFICATION_REQUIRED;
}

console.log('✅ PACK 309 — Swipe & Discovery 18+ Verification Enforcement initialized');