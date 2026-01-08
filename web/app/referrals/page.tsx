'use client';

/**
 * Referrals Page
 * Web interface for managing referrals and viewing stats
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ReferralStats {
  userId: string;
  code: string;
  totalInvites: number;
  verifiedInvites: number;
  payingInvites: number;
  totalRewardsEarned: number;
  pendingRewards: number;
  recentReferrals: Array<{
    userId: string;
    status: 'pending' | 'verified' | 'paying';
    joinedAt: Date;
  }>;
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralData, setReferralData] = useState<ReferralStats | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (user) {
      loadReferralData();
    }
  }, [user]);

  const loadReferralData = async () => {
    try {
      setLoading(true);
      const functions = getFunctions();
      const getStats = httpsCallable(functions, 'getMyReferralStats');
      const result = await getStats();
      setReferralData(result.data as ReferralStats);
    } catch (error) {
      console.error('Error loading referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!referralData?.code) return;

    try {
      setCopying(true);
      await navigator.clipboard.writeText(referralData.code);
      alert('Referral code copied to clipboard!');
    } catch (error) {
      console.error('Error copying code:', error);
      alert('Failed to copy code');
    } finally {
      setCopying(false);
    }
  };

  const handleCopyLink = async () => {
    if (!referralData?.code) return;

    try {
      const link = `${window.location.origin}?ref=${referralData.code}`;
      await navigator.clipboard.writeText(link);
      alert('Referral link copied to clipboard!');
    } catch (error) {
      console.error('Error copying link:', error);
      alert('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (!referralData?.code) return;

    const link = `${window.location.origin}?ref=${referralData.code}`;
    const text = `Join me on Avalo! Use my referral code: ${referralData.code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join Avalo', text, url: link });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      handleCopyLink();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Sign in to view your referrals
          </h2>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-pink-600 text-white font-semibold rounded-lg hover:bg-pink-700"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading referral data...</p>
        </div>
      </div>
    );
  }

  const stats = referralData;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Referrals</h1>
          <p className="mt-2 text-gray-600">
            Share your referral code and earn tokens when your friends join Avalo
          </p>
        </div>

        {/* Referral Code Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Your Referral Code
          </h2>
          
          <div className="bg-gray-50 rounded-lg p-6 mb-4 text-center">
            <div className="text-3xl font-bold text-pink-600 tracking-wider mb-4">
              {referralData?.code || 'Loading...'}
            </div>
            <div className="text-sm text-gray-500">
              Share this code with friends to earn rewards
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleCopyCode}
              disabled={copying || !referralData?.code}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {copying ? 'Copying...' : 'Copy Code'}
            </button>
            <button
              onClick={handleCopyLink}
              disabled={!referralData?.code}
              className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              Copy Link
            </button>
            <button
              onClick={handleShare}
              disabled={!referralData?.code}
              className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
            >
              Share
            </button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Your Referral Stats
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-pink-600">
                {stats?.totalInvites || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Invites</div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-pink-600">
                {stats?.verifiedInvites || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Verified Users</div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-pink-600">
                {stats?.payingInvites || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Paying Users</div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-pink-600">
                {stats?.totalRewardsEarned || 0}
              </div>
              <div className="text-sm text-gray-600 mt-1">Tokens Earned</div>
            </div>
          </div>
        </div>


        {/* How It Works Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            How It Works
          </h2>
          
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 font-semibold mr-3">
                1
              </div>
              <div>
                <p className="text-gray-700">Share your referral code with friends</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 font-semibold mr-3">
                2
              </div>
              <div>
                <p className="text-gray-700">
                  Earn <span className="font-semibold text-pink-600">50 tokens</span> when they verify their account
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 font-semibold mr-3">
                3
              </div>
              <div>
                <p className="text-gray-700">
                  Earn <span className="font-semibold text-pink-600">100 tokens</span> when they make their first payment
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 font-semibold mr-3">
                4
              </div>
              <div>
                <p className="text-gray-700">
                  Become an <span className="font-semibold text-amber-600">affiliate</span> with 5+ paying referrals
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Referrals */}
        {referralData && referralData.recentReferrals && referralData.recentReferrals.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Recent Referrals
            </h2>
            
            <div className="space-y-3">
              {referralData.recentReferrals.map((referral, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center py-3 border-b border-gray-200 last:border-0"
                >
                  <div>
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full capitalize">
                      {referral.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(referral.joinedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}