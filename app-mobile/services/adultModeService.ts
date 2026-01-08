/**
 * PACK 206c — Adult Mode Service
 * Handles adult mode toggle, consent, and status management
 * 
 * Version: REVISED v2 (OVERWRITE)
 * Date: 2025-12-01
 */

import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';

export interface AdultModeStatus {
  chatId: string;
  user1Id: string;
  user1Enabled: boolean;
  user2Id: string;
  user2Enabled: boolean;
  bothEnabled: boolean;
  currentUserEnabled: boolean;
  otherUserEnabled: boolean;
}

export interface AdultModeToggleResponse {
  success: boolean;
  chatId: string;
  currentUserEnabled: boolean;
  otherUserEnabled: boolean;
  bothEnabled: boolean;
  message: string;
  requiresVerification?: boolean;
}

export interface AgeVerificationStatus {
  userId: string;
  isVerified: boolean;
  verifiedAge: number | null;
  verificationMethod?: string;
  verifiedAt?: Date;
}

export type AdultModeReportReason =
  | 'non_consensual'
  | 'coercion'
  | 'explicit_media'
  | 'escorting'
  | 'minor_content'
  | 'illegal_content'
  | 'harassment'
  | 'other';

/**
 * Toggle adult mode for current user in a chat
 */
export async function toggleAdultMode(
  chatId: string,
  enabled: boolean
): Promise<AdultModeToggleResponse> {
  try {
    const toggleFn = httpsCallable<
      { chatId: string; enabled: boolean },
      AdultModeToggleResponse
    >(functions, 'toggleAdultMode');

    const result = await toggleFn({ chatId, enabled });
    return result.data;
  } catch (error: any) {
    console.error('[PACK 206c] Error toggling adult mode:', error);
    throw new Error(error.message || 'Failed to toggle adult mode');
  }
}

/**
 * Get current adult mode status for a chat
 */
export async function getAdultModeStatus(
  chatId: string
): Promise<AdultModeStatus | null> {
  try {
    const getStatusFn = httpsCallable<
      { chatId: string },
      AdultModeStatus | null
    >(functions, 'getAdultModeStatus');

    const result = await getStatusFn({ chatId });
    return result.data;
  } catch (error: any) {
    console.error('[PACK 206c] Error getting adult mode status:', error);
    return null;
  }
}

/**
 * Subscribe to adult mode status changes
 */
export function subscribeToAdultModeStatus(
  chatId: string,
  onUpdate: (status: AdultModeStatus | null) => void,
  onError?: (error: Error) => void
): () => void {
  const settingsRef = doc(db, 'adult_mode_settings', chatId);

  const unsubscribe = onSnapshot(
    settingsRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(null);
        return;
      }

      const data = snapshot.data();
      const currentUserId = ''; // Will be set by caller with useAuth

      const status: AdultModeStatus = {
        chatId: data.chatId,
        user1Id: data.user1Id,
        user1Enabled: data.user1Enabled,
        user2Id: data.user2Id,
        user2Enabled: data.user2Enabled,
        bothEnabled: data.bothEnabled,
        currentUserEnabled: false,
        otherUserEnabled: false,
      };

      onUpdate(status);
    },
    (error) => {
      console.error('[PACK 206c] Error subscribing to adult mode status:', error);
      if (onError) {
        onError(error as Error);
      }
    }
  );

  return unsubscribe;
}

/**
 * Check if user has age verification
 */
export async function checkAgeVerification(): Promise<AgeVerificationStatus> {
  try {
    const checkFn = httpsCallable<void, AgeVerificationStatus>(
      functions,
      'getAgeVerificationStatus'
    );

    const result = await checkFn();
    return result.data;
  } catch (error: any) {
    console.error('[PACK 206c] Error checking age verification:', error);
    return {
      userId: '',
      isVerified: false,
      verifiedAge: null,
    };
  }
}

/**
 * Report abuse in adult mode
 */
export async function reportAdultModeAbuse(
  chatId: string,
  reportedUserId: string,
  reason: AdultModeReportReason,
  description: string
): Promise<{ success: boolean; reportId: string }> {
  try {
    const reportFn = httpsCallable<
      {
        chatId: string;
        reportedUserId: string;
        reason: AdultModeReportReason;
        description: string;
      },
      { success: boolean; reportId: string }
    >(functions, 'reportAdultModeAbuse');

    const result = await reportFn({
      chatId,
      reportedUserId,
      reason,
      description,
    });

    return result.data;
  } catch (error: any) {
    console.error('[PACK 206c] Error reporting abuse:', error);
    throw new Error(error.message || 'Failed to report abuse');
  }
}

/**
 * Get localized consent dialog content
 */
export function getConsentDialogContent(language: 'en' | 'pl' = 'en') {
  const content = {
    en: {
      title: 'Enable Adult Mode?',
      message: 'This allows sexual and romantic content between consenting adults.',
      warnings: [
        'You can disable this at any time',
        'Both users must enable for it to be active',
        'Report abuse immediately if you feel uncomfortable',
        'Explicit pornography and illegal content are still prohibited',
      ],
      confirmButtonText: 'I Understand & Enable',
      cancelButtonText: 'Cancel',
      requiresVerification: 'Age verification required',
      verificationMessage: 'You must verify you are 18+ before enabling adult mode',
    },
    pl: {
      title: 'Włączyć Tryb Dla Dorosłych?',
      message: 'To umożliwia treści seksualne i romantyczne między zgadzającymi się dorosłymi.',
      warnings: [
        'Możesz to wyłączyć w dowolnym momencie',
        'Obaj użytkownicy muszą włączyć, aby było aktywne',
        'Zgłoś nadużycie natychmiast, jeśli czujesz się niekomfortowo',
        'Wyraźna pornografia i nielegalne treści są nadal zabronione',
      ],
      confirmButtonText: 'Rozumiem i Włączam',
      cancelButtonText: 'Anuluj',
      requiresVerification: 'Wymagana weryfikacja wieku',
      verificationMessage: 'Musisz zweryfikować, że masz 18+ przed włączeniem trybu dla dorosłych',
    },
  };

  return content[language];
}

/**
 * Check if content should be filtered based on adult mode status
 */
export function shouldFilterContent(adultModeEnabled: boolean): {
  allowSexualLanguage: boolean;
  allowSensualPhotos: boolean;
  blockExplicitMedia: boolean;
  blockCoercion: boolean;
  blockIllegalContent: boolean;
  blockEscorting: boolean;
} {
  return {
    allowSexualLanguage: adultModeEnabled,
    allowSensualPhotos: adultModeEnabled,
    blockExplicitMedia: true, // Always blocked, even in adult mode
    blockCoercion: true, // Always blocked
    blockIllegalContent: true, // Always blocked
    blockEscorting: true, // Always blocked
  };
}