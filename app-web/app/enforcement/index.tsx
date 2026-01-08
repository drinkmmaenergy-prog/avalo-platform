/**
 * PACK 419 — Web User Enforcement List
 * 
 * Web version with parity to mobile app
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  EnforcementDecision,
  EnforcementScope,
  EnforcementActionType,
} from '../../../shared/types/pack419-enforcement.types';

export default function EnforcementListPage() {
  const router = useRouter();
  const [enforcements, setEnforcements] = useState<EnforcementDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEnforcements();
  }, []);

  const loadEnforcements = async () => {
    if (!auth.currentUser) {
      router.push('/login');
      return;
    }

    try {
      const q = query(
        collection(db, 'enforcementDecisions'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const decisions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EnforcementDecision[];

      setEnforcements(decisions);
    } catch (error) {
      console.error('Failed to load enforcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: EnforcementActionType) => {
    const badges = {
      [EnforcementActionType.WARNING]: { label: 'Warning', className: 'bg-yellow-500' },
      [EnforcementActionType.TEMP_RESTRICTION]: { label: 'Temporary', className: 'bg-orange-500' },
      [EnforcementActionType.PERMA_BAN]: { label: 'Permanent', className: 'bg-red-600' },
      [EnforcementActionType.SHADOW_RESTRICTION]: { label: 'Restricted', className: 'bg-gray-600' },
    };
    return badges[action];
  };

  const getScopeLabel = (scopes: EnforcementScope[]) => {
    if (scopes.includes(EnforcementScope.ACCOUNT_FULL)) {
      return 'Full Account';
    }
    return scopes.slice(0, 2).map(s => s.toLowerCase().replace('_', ' ')).join(', ');
  };

  const isActive = (enforcement: EnforcementDecision) => {
    if (!enforcement.isActive) return false;
    if (!enforcement.expiresAt) return true;
    return enforcement.expiresAt > Date.now();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading restrictions...</p>
        </div>
      </div>
    );
  }

  if (enforcements.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Restrictions</h2>
          <p className="text-gray-600">
            Your account has no active restrictions or enforcement history.
          </p>
        </div>
      </div>
    );
  }

  const activeEnforcements = enforcements.filter(isActive);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Restrictions</h1>
          <p className="text-gray-600">View your enforcement history and appeals</p>
        </div>

        {activeEnforcements.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-700">Active Restrictions</h2>
            <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
              {activeEnforcements.length}
            </span>
          </div>
        )}

        <div className="space-y-4">
          {enforcements.map(enforcement => {
            const badge = getActionBadge(enforcement.action);
            const active = isActive(enforcement);

            return (
              <div
                key={enforcement.id}
                onClick={() => router.push(`/enforcement/${enforcement.id}`)}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`${badge.className} text-white px-3 py-1.5 rounded-md text-sm font-semibold`}>
                    {badge.label}
                  </span>
                  {active && (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-md text-xs font-semibold">
                      Active
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 capitalize">
                  {getScopeLabel(enforcement.scopes)}
                </h3>

                <p className="text-sm text-gray-600 mb-1">
                  Issued: {new Date(enforcement.createdAt).toLocaleDateString()}
                </p>

                {enforcement.expiresAt && (
                  <p className="text-sm text-yellow-700 mb-2">
                    {active
                      ? `Expires: ${new Date(enforcement.expiresAt).toLocaleDateString()}`
                      : 'Expired'
                    }
                  </p>
                )}

                {enforcement.appealId && (
                  <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-md text-xs font-medium mt-2">
                    Appeal Submitted
                  </span>
                )}

                {enforcement.isAppealable && !enforcement.appealId && active && (
                  <span className="inline-block text-blue-600 text-sm font-medium mt-2">
                    Appealable
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
