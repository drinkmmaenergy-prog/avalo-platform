/**
 * PACK 343 — User Compliance & Verification Hooks
 * Track age verification, KYC, and legal compliance status
 */

'use client';

import { useState, useCallback } from 'react';

export interface UserComplianceStatus {
  userId: string;
  ageVerified: boolean;
  ageVerifiedAt: Date | null;
  ageVerificationMethod: 'SELFIE' | 'ID' | 'MANUAL' | null;
  kycVerified: boolean;
  kycVerifiedAt: Date | null;
  kycProvider: string | null;
  selfieVerified: boolean;
  selfieVerifiedAt: Date | null;
  legalHold: boolean;
  regulatorLock: boolean;
  country: string | null;
}

export interface LegalAcceptance {
  userId: string;
  documentType: 'TERMS' | 'PRIVACY' | 'CREATOR_TERMS' | 'WALLET_POLICY';
  version: string;
  acceptedAt: Date;
  ipAddress?: string;
}

/**
 * Hook for managing compliance and verification status
 */
export function useCompliance() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get user's compliance status
   */
  const getComplianceStatus = useCallback(async (): Promise<UserComplianceStatus> => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with Firestore read
      // const db = getFirestore();
      // const uid = auth.currentUser?.uid;
      // if (!uid) throw new Error('Not authenticated');
      // const docRef = doc(db, 'userComplianceStatus', uid);
      // const docSnap = await getDoc(docRef);
      // return docSnap.data() as UserComplianceStatus;

      // Placeholder
      return {
        userId: 'placeholder',
        ageVerified: false,
        ageVerifiedAt: null,
        ageVerificationMethod: null,
        kycVerified: false,
        kycVerifiedAt: null,
        kycProvider: null,
        selfieVerified: false,
        selfieVerifiedAt: null,
        legalHold: false,
        regulatorLock: false,
        country: null,
      };
    } catch (err: any) {
      const message = err.message || 'Failed to load compliance status';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get legal acceptance history
   */
  const getLegalAcceptances = useCallback(async (): Promise<LegalAcceptance[]> => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with Firestore query
      // const db = getFirestore();
      // const uid = auth.currentUser?.uid;
      // if (!uid) throw new Error('Not authenticated');
      // const q = query(
      //   collection(db, 'legalAcceptances'),
      //   where('userId', '==', uid),
      //   orderBy('acceptedAt', 'desc'),
      //   limit(20)
      // );
      // const snapshot = await getDocs(q);
      // return snapshot.docs.map(doc => doc.data() as LegalAcceptance);

      // Placeholder
      return [];
    } catch (err: any) {
      const message = err.message || 'Failed to load legal acceptances';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check if user can make payments (age gate)
   */
  const canMakePayments = useCallback((complianceStatus: UserComplianceStatus): boolean => {
    return complianceStatus.ageVerified && !complianceStatus.legalHold && !complianceStatus.regulatorLock;
  }, []);

  /**
   * Check if user can request payouts (KYC gate)
   */
  const canRequestPayouts = useCallback((complianceStatus: UserComplianceStatus): boolean => {
    return (
      complianceStatus.ageVerified &&
      complianceStatus.kycVerified &&
      !complianceStatus.legalHold &&
      !complianceStatus.regulatorLock
    );
  }, []);

  /**
   * Check if user can change subscription
   */
  const canChangeSubscription = useCallback((complianceStatus: UserComplianceStatus): boolean => {
    return complianceStatus.ageVerified && !complianceStatus.legalHold && !complianceStatus.regulatorLock;
  }, []);

  return {
    loading,
    error,
    getComplianceStatus,
    getLegalAcceptances,
    canMakePayments,
    canRequestPayouts,
    canChangeSubscription,
  };
}
