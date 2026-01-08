/**
 * Campaigns List Page - Phase 19A
 * View and manage all ad campaigns
 */

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAdvertiser } from '@/lib/hooks/useAdvertiser';
import { getAdvertiserCampaigns, formatTokens, getStatusColor } from '@/lib/services/adsClient';
import { AdCampaign } from '@/lib/types/advertiser';
import { Plus, Play, Pause, BarChart3 } from 'lucide-react';

export default function CampaignsListPage() {
  const router = useRouter();
  const { user, advertiser, loading: authLoading, needsProfile } = useRequireAdvertiser();
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if needs profile
  useEffect(() => {
    if (!authLoading && needsProfile) {
      router.push('/brands/settings');
    }
  }, [authLoading, needsProfile, router]);

  // Load campaigns
  useEffect(() => {
    if (!user) return;

    const loadCampaigns = async () => {
      try {
        const data = await getAdvertiserCampaigns(user.uid);
        setCampaigns(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    };

    loadCampaigns();
  }, [user]);

  const calculateCTR = (clicks: number, impressions: number): string => {
    if (impressions === 0) return '0.00';
    return ((clicks / impressions) * 100).toFixed(2);
  };

  const getBudgetUtilization = (spent: number, budget: number): number => {
    if (budget === 0) return 0;
    return (spent / budget) * 100;
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
              <h1 className="text-3xl font-bold text-gray-900">My Campaigns</h1>
              <p className="text-gray-600 mt-1">
                Manage and track your advertising campaigns
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/brands/billing')}
                className="btn-secondary"
              >
                Billing
              </button>
              <button
                onClick={() => router.push('/brands/settings')}
                className="btn-secondary"
              >
                Settings
              </button>
              <button
                onClick={() => router.push('/brands/campaigns/new')}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Campaign
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Summary Stats */}
        {campaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="card">
              <p className="text-sm text-gray-600 mb-1">Total Campaigns</p>
              <p className="text-3xl font-bold text-gray-900">{campaigns.length}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-600 mb-1">Active Campaigns</p>
              <p className="text-3xl font-bold text-green-600">
                {campaigns.filter((c) => c.status === 'active').length}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-600 mb-1">Total Impressions</p>
              <p className="text-3xl font-bold text-blue-600">
                {campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-600 mb-1">Total Clicks</p>
              <p className="text-3xl font-bold text-purple-600">
                {campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        <div className="card">
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No campaigns yet
              </h3>
              <p className="text-gray-600 mb-6">
                Create your first campaign to start advertising on Avalo
              </p>
              <button
                onClick={() => router.push('/brands/campaigns/new')}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Your First Campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Campaign
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Type
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Budget
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Spent
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Impressions
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Clicks
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      CTR
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => {
                    const utilization = getBudgetUtilization(
                      campaign.spentTokens,
                      campaign.budgetTokens
                    );
                    
                    return (
                      <tr
                        key={campaign.campaignId}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/brands/campaigns/${campaign.campaignId}`)}
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{campaign.title}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {campaign.placements.join(', ')}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                              campaign.status
                            )}`}
                          >
                            {campaign.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-gray-700">
                            {campaign.campaignType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>
                            <p className="font-medium text-gray-900">
                              {campaign.budgetTokens.toLocaleString()} 🪙
                            </p>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  utilization >= 90
                                    ? 'bg-red-500'
                                    : utilization >= 70
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(utilization, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className="font-medium text-gray-900">
                            {campaign.spentTokens.toLocaleString()} 🪙
                          </p>
                          <p className="text-xs text-gray-500">
                            {utilization.toFixed(0)}% used
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className="font-medium text-gray-900">
                            {campaign.impressions.toLocaleString()}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className="font-medium text-gray-900">
                            {campaign.clicks.toLocaleString()}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className="font-medium text-gray-900">
                            {calculateCTR(campaign.clicks, campaign.impressions)}%
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/brands/campaigns/${campaign.campaignId}`);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="View details"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}