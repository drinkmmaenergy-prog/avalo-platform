/**
 * Advertiser Billing Page - Phase 19A
 * Token balance and top-up interface
 */

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAdvertiser } from '@/lib/hooks/useAdvertiser';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserWallet } from '@/lib/types';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';

export default function AdvertiserBillingPage() {
  const router = useRouter();
  const { user, advertiser, loading: authLoading, needsProfile } = useRequireAdvertiser();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Load wallet data
  useEffect(() => {
    if (!user) return;

    const walletRef = doc(db, 'users', user.uid, 'wallet', 'current');
    const unsubscribe = onSnapshot(walletRef, (snapshot) => {
      if (snapshot.exists()) {
        setWallet(snapshot.data() as UserWallet);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Redirect if needs profile
  useEffect(() => {
    if (!authLoading && needsProfile) {
      router.push('/brands/settings');
    }
  }, [authLoading, needsProfile, router]);

  const handleTopUp = () => {
    // Redirect to existing wallet page for token purchase
    router.push('/wallet');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!advertiser) {
    return null; // Redirect will happen
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Billing & Tokens</h1>
              <p className="text-gray-600 mt-1">
                Manage your advertising budget and token balance
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/brands/campaigns')}
                className="btn-secondary"
              >
                Campaigns
              </button>
              <button
                onClick={() => router.push('/brands/settings')}
                className="btn-secondary"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Token Balance Card */}
        <div className="card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Available Balance</p>
              <p className="text-4xl font-bold text-primary-500">
                {wallet?.balance || 0}
                <span className="text-2xl ml-2">🪙</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Ready to spend on campaigns
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Spent (Ads)</p>
              <p className="text-3xl font-semibold text-gray-900">
                {wallet?.spent || 0}
                <span className="text-xl ml-2">🪙</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Across all campaigns
              </p>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleTopUp}
                className="btn-primary w-full text-lg"
              >
                💰 Top Up Tokens
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="card bg-blue-50 border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            💡 About Token Payment
          </h3>
          <div className="space-y-3 text-sm text-blue-800">
            <p>
              <strong>How it works:</strong> Purchase tokens using your existing Avalo wallet,
              then use them to fund your ad campaigns.
            </p>
            <div className="bg-blue-100 rounded-lg p-4">
              <p className="font-semibold mb-2">Ad Pricing:</p>
              <ul className="space-y-1 ml-4">
                <li>• <strong>CPC (Cost Per Click):</strong> 5 tokens per click</li>
                <li>• <strong>CPM (Cost Per 1000 Impressions):</strong> 50 tokens per 1K views</li>
                <li>• <strong>Minimum Campaign Budget:</strong> 100 tokens</li>
              </ul>
            </div>
            <p>
              <strong>Billing:</strong> Tokens are deducted automatically as your ads receive
              impressions (CPM) or clicks (CPC). You can pause campaigns anytime.
            </p>
            <p>
              <strong>Budget Control:</strong> Set daily caps and total budgets to control
              spending. Campaigns auto-pause when budget is exhausted.
            </p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card mt-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Recent Ad Spending
          </h3>
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No recent ad spending activity</p>
            <p className="text-sm mt-1">
              Spend data will appear here as your campaigns run
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <div className="flex items-start">
              <div className="p-3 bg-green-100 rounded-lg mr-4">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-green-900 mb-1">
                  Create Your First Campaign
                </h4>
                <p className="text-sm text-green-800 mb-3">
                  Start advertising on Avalo with as little as 100 tokens
                </p>
                <button
                  onClick={() => router.push('/brands/campaigns/new')}
                  className="btn-primary text-sm"
                >
                  Create Campaign
                </button>
              </div>
            </div>
          </div>

          <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-start">
              <div className="p-3 bg-blue-100 rounded-lg mr-4">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">
                  Need More Tokens?
                </h4>
                <p className="text-sm text-blue-800 mb-3">
                  Purchase tokens to keep your campaigns running
                </p>
                <button
                  onClick={handleTopUp}
                  className="btn-primary text-sm"
                >
                  Buy Tokens
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}