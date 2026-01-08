/**
 * PACK 308 — Verified Badge UI, Trust Labels & Safety Messaging
 * 
 * Hook to fetch and display user trust labels
 * Based on verification status and risk state
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  TrustLabel, 
  VerificationData, 
  UserRisk, 
  getUserTrustLabel 
} from '../types/trust';

export interface UseTrustLabelResult {
  trustLabel: TrustLabel | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Fetch trust label for a specific user
 * Returns verified status, trust level, and safety flags
 */
export function useTrustLabel(userId: string | undefined): UseTrustLabelResult {
  const [trustLabel, setTrustLabel] = useState<TrustLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrustLabel = async () => {
    if (!userId) {
      setTrustLabel(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch verification status
      const verificationRef = doc(db, 'users', userId, 'verification', 'status');
      const verificationSnap = await getDoc(verificationRef);
      
      let verificationData: VerificationData | null = null;
      if (verificationSnap.exists()) {
        const data = verificationSnap.data();
        verificationData = {
          status: data.status || 'NOT_STARTED',
          ageVerified: data.ageVerified || false,
          minAgeConfirmed: data.minAgeConfirmed || 0,
        };
      }

      // Fetch risk state
      const riskRef = doc(db, 'userRisk', userId);
      const riskSnap = await getDoc(riskRef);
      
      let riskState: UserRisk | null = null;
      if (riskSnap.exists()) {
        const data = riskSnap.data();
        riskState = {
          riskLevel: data.riskLevel || 'LOW',
          catfishRiskScore: data.catfishRiskScore || 0,
          autoHiddenFromDiscovery: data.autoHiddenFromDiscovery || false,
        };
      } else {
        // Default risk state if not found
        riskState = {
          riskLevel: 'LOW',
          catfishRiskScore: 0,
          autoHiddenFromDiscovery: false,
        };
      }

      // Compute trust label
      const label = getUserTrustLabel(verificationData, riskState);
      setTrustLabel(label);
    } catch (err) {
      console.error('Error fetching trust label:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      
      // Fail-safe: return default unverified state
      setTrustLabel({
        verified: false,
        trustLevel: 'MEDIUM',
        safetyFlags: {
          underReview: false,
          visibilityLimited: false,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrustLabel();
  }, [userId]);

  return {
    trustLabel,
    loading,
    error,
    refresh: fetchTrustLabel,
  };
}