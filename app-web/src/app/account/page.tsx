'use client';

import { MONETIZATION_SPLITS } from "@constants/monetization";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
/**
 * PACK 343 — Unified Account Panel
 * Overview page showing profile, subscription, wallet,
 */
import Link from 'next/link';
import Image from 'next/image';

import { AccountLayout } from '../../components/account/AccountLayout';

import { useWallet } from '../../../hooks/useWallet';
import { useSubscription } from '../../../hooks/useSubscription';
import { useCompliance } from '../../../hooks/useCompliance';
import { useAuth } from '@/components/providers/AuthProvider';
import { recordSession } from '@/lib/services/accountService';

import type { WalletBalance } from '../../../hooks/useWallet';
import type { UserSubscription } from '../../../hooks/useSubscription';
import type { UserComplianceStatus } from '../../../hooks/useCompliance';

export default function AccountPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();

  const { getBalance } = useWallet();
  const { getCurrentSubscription } = useSubscription();
  const { getComplianceStatus } = useCompliance();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Record session on mount when user is authenticated
  useEffect(() => {
    if (firebaseUser) {
      recordSession().catch((err) => {
        console.warn('[Account] Failed to record session:', err);
      });
    }
  }, [firebaseUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const balanceData = await getBalance();
      const subscriptionData = await getCurrentSubscription();
      const complianceData = await getComplianceStatus();

      setBalance(balanceData);
      setSubscription(subscriptionData);
      setCompliance(complianceData);
    } catch (err) {
      console.error('Account load error', err);
      setError('Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading account...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Account</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  const getFiatEquivalent = (tokens: number) => {
    return (tokens * MONETIZATION_SPLITS.EVENT_TICKET.avalo).toFixed(2);
  };

  return (
    <AccountLayout>
      {/* Profile Summary — wired to Firebase Auth + Firestore */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Profile Summary</h2>
          <Link
            href="/account/profile"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Edit Profile &rarr;
          </Link>
        </div>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            {user?.photoURL || firebaseUser?.photoURL ? (
              <Image
                src={user?.photoURL || firebaseUser?.photoURL || ''}
                alt={user?.displayName || 'User avatar'}
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover border-2 border-purple-200"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl">
                {user?.displayName?.charAt(0)?.toUpperCase() || '👤'}
              </div>
            )}
            {user?.isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                ✓
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {user?.displayName || firebaseUser?.displayName || 'No Name Set'}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              {user?.email || firebaseUser?.email || 'No email'}
            </p>
            {user?.bio && (
              <p className="text-sm text-gray-700 mb-3 line-clamp-2">{user.bio}</p>
            )}
            {user?.handle && (
              <p className="text-sm text-purple-600 font-medium mb-2">@{user.handle}</p>
            )}

            {/* Badges row */}
            <div className="flex flex-wrap gap-2 mt-2">
              {user?.isCreator && (
                <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✨ Creator
                </span>
              )}
              {compliance?.selfieVerified && (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ Selfie Verified
                </span>
              )}
              {compliance?.kycVerified && (
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ KYC Verified
                </span>
              )}
              {compliance?.ageVerified && (
                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ Age Verified
                </span>
              )}
            </div>

            {/* Account metadata */}
            <div className="mt-3 text-xs text-gray-400 space-y-1">
              {firebaseUser?.metadata?.creationTime && (
                <p>Member since: {new Date(firebaseUser.metadata.creationTime).toLocaleDateString()}</p>
              )}
              {firebaseUser?.metadata?.lastSignInTime && (
                <p>Last sign-in: {new Date(firebaseUser.metadata.lastSignInTime).toLocaleDateString()}</p>
              )}
              {compliance?.country && (
                <p>Country: {compliance.country}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Status */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Subscription Status</h2>
          <Link
            href="/account/billing"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Manage &rarr;
          </Link>
        </div>
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm mb-1">Current Tier</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {subscription?.tier || 'FREE'}
                {subscription?.tier === 'VIP' && ' 👑'}
                {subscription?.tier === 'ROYAL' && ' 💎'}
              </h3>
              {subscription?.source && subscription.source !== 'WEB_STRIPE' && (
                <p className="text-sm text-gray-600">
                  Managed via{' '}
                  {subscription.source === 'IOS_STORE' ? 'App Store' : 'Google Play'}
                </p>
              )}
              {subscription?.renewsAt && (
                <p className="text-sm text-gray-600">
                  Renews: {new Date(subscription.renewsAt).toLocaleDateString()}
                </p>
              )}
            </div>
            {subscription && subscription.tier !== 'FREE' && (
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-2">Benefits:</p>
                <div className="space-y-1 text-sm">
                  {subscription.benefits.voiceCallDiscount > 0 && (
                    <div className="text-purple-700">
                      -{subscription.benefits.voiceCallDiscount}% calls
                    </div>
                  )}
                  {subscription.benefits.prioritySupport && (
                    <div className="text-purple-700">Priority support</div>
                  )}
                  {subscription.benefits.profileBoost && (
                    <div className="text-purple-700">Profile boost</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Wallet Overview */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Wallet Overview</h2>
          <Link
            href="/account/tokens"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Buy Tokens &rarr;
          </Link>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 text-white mb-4">
          <p className="text-purple-200 text-sm mb-2">Current Balance</p>
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-4xl font-bold">
              {balance?.tokensBalance.toLocaleString() || '0'}
            </h3>
            <span className="text-xl text-purple-200">tokens</span>
          </div>
          <div className="pt-4 border-t border-purple-400">
            <p className="text-lg font-semibold">
              ≈ {getFiatEquivalent(balance?.tokensBalance || 0)} PLN
            </p>
            <p className="text-sm text-purple-200">Estimated payout value</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/wallet/transactions"
            className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition"
          >
            <span>📜</span>
            <span className="font-medium text-gray-900">History</span>
          </Link>
          <Link
            href="/wallet/payouts"
            className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition"
          >
            <span>💰</span>
            <span className="font-medium text-gray-900">Payouts</span>
          </Link>
        </div>
      </section>

      {/* Security Summary */}
      <section className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Security & Verification</h2>
          <Link
            href="/account/security"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            View Details &rarr;
          </Link>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {compliance?.ageVerified ? '✅' : '⚠️'}
              </span>
              <div>
                <p className="font-medium text-gray-900">Age Verification</p>
                <p className="text-sm text-gray-600">
                  {compliance?.ageVerified ? 'Verified' : 'Required for payments'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {compliance?.kycVerified ? '✅' : 'ℹ️'}
              </span>
              <div>
                <p className="font-medium text-gray-900">KYC Verification</p>
                <p className="text-sm text-gray-600">
                  {compliance?.kycVerified ? 'Verified' : 'Required for payouts'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-medium text-gray-900">Account Security</p>
                <p className="text-sm text-gray-600">
                  {compliance?.legalHold || compliance?.regulatorLock
                    ? 'Restricted'
                    : 'Active'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Warnings */}
      {(compliance?.legalHold || compliance?.regulatorLock) && (
        <div className="mt-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
          <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
            <span>⚠️</span>
            <span>Account Restriction Active</span>
          </h4>
          <p className="text-red-800 text-sm">
            Your account has restrictions. Payment and subscription operations may be limited.
            Please contact support for more information.
          </p>
        </div>
      )}
    </AccountLayout>
  );
}
