'use client';

/**
 * FIX 112: First Purchase Incentive Banner
 *
 * Shown on /wallet when balance === 0 and user has never purchased.
 * Reads hasPurchased from user profile or wallets collection.
 *
 * INVARIANTS:
 *   - Display-only component — no business logic or pricing changes.
 *   - Actual 20% bonus is applied by backend on first purchase.
 *   - Uses requireDb() canonical guard.
 *   - Uses useAuth() from AuthProvider.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

interface FirstPurchaseIncentiveProps {
  balance: number;
}

export default function FirstPurchaseIncentive({ balance }: FirstPurchaseIncentiveProps) {
  const { firebaseUser } = useAuth();
  const [hasPurchased, setHasPurchased] = useState<boolean | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();

    // Check if user has ever purchased
    getDoc(doc(db, 'wallets', firebaseUser.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setHasPurchased(
            !!(data.firstPurchaseAt || data.totalPurchases > 0 || data.hasPurchased)
          );
        } else {
          setHasPurchased(false);
        }
      })
      .catch(() => {
        // If wallet doesn't exist or is inaccessible, assume no purchase
        setHasPurchased(false);
      });
  }, [firebaseUser?.uid]);

  // Don't render if still loading, or user has purchased, or has balance
  if (hasPurchased === null || hasPurchased || balance > 0) return null;

  return (
    <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl mb-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🎉</span>
        <div>
          <p className="font-bold text-sm">First purchase bonus!</p>
          <p className="text-xs text-gray-600">
            Buy any token pack and get +20% bonus tokens
          </p>
          <p className="text-[10px] text-green-600 mt-1">Limited time offer</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check first-purchase status for use in TokenPackCard.
 * Returns hasPurchased boolean (null while loading).
 */
export function useFirstPurchaseStatus(): boolean | null {
  const { firebaseUser } = useAuth();
  const [hasPurchased, setHasPurchased] = useState<boolean | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();

    getDoc(doc(db, 'wallets', firebaseUser.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setHasPurchased(
            !!(data.firstPurchaseAt || data.totalPurchases > 0 || data.hasPurchased)
          );
        } else {
          setHasPurchased(false);
        }
      })
      .catch(() => setHasPurchased(false));
  }, [firebaseUser?.uid]);

  return hasPurchased;
}
