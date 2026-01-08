/**
 * PACK 306 — Verification Guard Hook
 * Blocks access to features until user is verified
 */

import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'BANNED' | 'BANNED_TEMP' | 'BANNED_PERMANENT';

export interface VerificationState {
  status: VerificationStatus;
  loading: boolean;
  isVerified: boolean;
}

/**
 * Hook to check and enforce verification status
 * Redirects unverified users to verification screen
 */
export function useVerificationGuard(options?: {
  redirect?: boolean;
  allowPending?: boolean;
}): VerificationState {
  const [state, setState] = useState<VerificationState>({
    status: 'UNVERIFIED',
    loading: true,
    isVerified: false,
  });

  const redirect = options?.redirect !== false;
  const allowPending = options?.allowPending || false;

  useEffect(() => {
    if (!auth.currentUser) {
      setState({
        status: 'UNVERIFIED',
        loading: false,
        isVerified: false,
      });
      return;
    }

    const statusRef = doc(
      db,
      'users',
      auth.currentUser.uid,
      'verification',
      'status'
    );

    const unsubscribe = onSnapshot(
      statusRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const status = data.status as VerificationStatus;
          const isVerified = status === 'VERIFIED' || (allowPending && status === 'PENDING');

          setState({
            status,
            loading: false,
            isVerified,
          });

          // Redirect to verification screen if not verified
          if (!isVerified && redirect) {
            router.replace('/identity/verify' as any);
          }
        } else {
          // No verification record - must verify
          setState({
            status: 'UNVERIFIED',
            loading: false,
            isVerified: false,
          });

          if (redirect) {
            router.replace('/identity/verify' as any);
          }
        }
      },
      (error) => {
        console.error('Verification guard error:', error);
        setState({
          status: 'UNVERIFIED',
          loading: false,
          isVerified: false,
        });
      }
    );

    return () => unsubscribe();
  }, [redirect, allowPending]);

  return state;
}

/**
 * Check if user can access a feature
 */
export async function canAccessFeature(
  userId: string,
  feature: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const statusRef = doc(db, 'users', userId, 'verification', 'status');
    const statusDoc = await getDoc(statusRef);

    if (!statusDoc.exists()) {
      return {
        allowed: false,
        reason: 'Verification required',
      };
    }

    const data = statusDoc.data();
    if (data.status !== 'VERIFIED') {
      return {
        allowed: false,
        reason: `Verification status: ${data.status}`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Feature access check error:', error);
    return {
      allowed: false,
      reason: 'Error checking verification status',
    };
  }
}

/**
 * Get verification status for current user
 */
export async function getVerificationStatus(): Promise<{
  status: VerificationStatus;
  attempts: number;
  ageVerified: boolean;
  photosChecked: boolean;
} | null> {
  if (!auth.currentUser) return null;

  try {
    const statusRef = doc(
      db,
      'users',
      auth.currentUser.uid,
      'verification',
      'status'
    );
    const statusDoc = await getDoc(statusRef);

    if (!statusDoc.exists()) return null;

    const data = statusDoc.data();
    return {
      status: data.status as VerificationStatus,
      attempts: data.attempts || 0,
      ageVerified: data.ageVerified || false,
      photosChecked: data.photosChecked || false,
    };
  } catch (error) {
    console.error('Get verification status error:', error);
    return null;
  }
}