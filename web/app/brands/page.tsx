/**
 * Brands Landing Page - Phase 19A
 * Entry point for advertisers
 */

"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdvertiser } from '@/lib/hooks/useAdvertiser';
import { Target, TrendingUp, Users, DollarSign } from 'lucide-react';

export default function BrandsLandingPage() {
  const router = useRouter();
  const { user, advertiser, loading } = useAdvertiser();

  useEffect(() => {
    // Auto-redirect if already an active advertiser
    if (!loading && advertiser?.status === 'active') {
      router.push('/brands/campaigns');
    }
  }, [loading, advertiser, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const handleGetStarted = () => {
    if (!user) {
      // Redirect to main app login
      router.push('/');
    } else if (!advertiser) {
      // Need to create advertiser profile
      router.push('/brands/settings');
    } else if (advertiser.status === 'active') {
      // Go to campaigns
      router.push('/brands/campaigns');
    } else {
      // Blocked advertiser
      alert('Your advertiser account is blocked. Please contact support.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">💼</div>
              <h1 className="text-2xl font-bold text-gray-900">Avalo Ads</h1>
            </div>
            {user && (
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Reach High-Intent Users
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Advertise your brand to engaged users on Avalo's premium dating and social platform.
            Drive real results with our targeted ad placements.
          </p>
          <button
            onClick={handleGetStarted}
            className="btn-primary text-lg px-8 py-4"
          >
            {!user
              ? 'Sign In to Start Advertising'
              : !advertiser
              ? 'Create Advertiser Account'
              : 'Go to Campaigns'}
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-blue-100 rounded-full">
                <Target className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Precise Targeting
            </h3>
            <p className="text-sm text-gray-600">
              Target by location, age, gender, interests, and user tier for maximum relevance.
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-green-100 rounded-full">
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Flexible Pricing
            </h3>
            <p className="text-sm text-gray-600">
              Choose between CPC (cost-per-click) or CPM (cost-per-impression) billing models.
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Engaged Audience
            </h3>
            <p className="text-sm text-gray-600">
              Connect with users actively seeking connections, products, and services.
            </p>
          </div>

          <div className="card text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-yellow-100 rounded-full">
                <DollarSign className="w-8 h-8 text-yellow-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Real-Time Analytics
            </h3>
            <p className="text-sm text-gray-600">
              Track impressions, clicks, CTR, and ROI with detailed campaign insights.
            </p>
          </div>
        </div>

        {/* Ad Formats */}
        <div className="card mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Native Ad Formats
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="bg-gray-100 rounded-lg p-6 mb-4 text-center">
                <div className="text-4xl mb-2">📱</div>
                <h4 className="font-semibold text-gray-900">Feed Ads</h4>
              </div>
              <p className="text-sm text-gray-600">
                Instagram-style native posts that blend seamlessly into user feeds.
                Perfect for brand awareness.
              </p>
            </div>

            <div>
              <div className="bg-gray-100 rounded-lg p-6 mb-4 text-center">
                <div className="text-4xl mb-2">💳</div>
                <h4 className="font-semibold text-gray-900">Swipe Ads</h4>
              </div>
              <p className="text-sm text-gray-600">
                Full-screen Tinder-style cards in discovery mode.
                High engagement with VIP users.
              </p>
            </div>

            <div>
              <div className="bg-gray-100 rounded-lg p-6 mb-4 text-center">
                <div className="text-4xl mb-2">📺</div>
                <h4 className="font-semibold text-gray-900">LIVE Overlay Ads</h4>
              </div>
              <p className="text-sm text-gray-600">
                Non-intrusive brand logos in live streaming rooms.
                Premium sponsorship opportunities.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Token-Based Pricing
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                💰 CPC - Cost Per Click
              </h4>
              <p className="text-3xl font-bold text-blue-600 mb-2">
                5 tokens
                <span className="text-sm font-normal text-gray-600 ml-2">per click</span>
              </p>
              <p className="text-sm text-gray-600">
                Pay only when users click your ad. Best for performance marketing and conversions.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                👁️ CPM - Cost Per 1000 Impressions
              </h4>
              <p className="text-3xl font-bold text-purple-600 mb-2">
                50 tokens
                <span className="text-sm font-normal text-gray-600 ml-2">per 1K views</span>
              </p>
              <p className="text-sm text-gray-600">
                Build brand awareness with guaranteed visibility. Ideal for reach campaigns.
              </p>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-700">
              💡 <strong>Minimum budget:</strong> 100 tokens to start your first campaign
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <h3 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Get Started?
          </h3>
          <p className="text-lg text-gray-600 mb-8">
            Create your advertiser account and launch your first campaign in minutes.
          </p>
          <button
            onClick={handleGetStarted}
            className="btn-primary text-lg px-8 py-4"
          >
            {!user
              ? 'Sign In Now'
              : !advertiser
              ? 'Create Account'
              : 'View Campaigns'}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-sm text-gray-600">
            © 2025 Avalo. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}