/**
 * Campaign Details & Analytics Page - Phase 19A
 * View and manage individual campaign
 */

"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRequireAdvertiser } from '@/lib/hooks/useAdvertiser';
import {
  getCampaign,
  getCampaignInsights,
  pauseCampaign,
  resumeCampaign,
  getStatusColor,
} from '@/lib/services/adsClient';
import { AdCampaign, CampaignInsights } from '@/lib/types/advertiser';
import { Play, Pause, Edit, BarChart3, Target, TrendingUp, MousePointer } from 'lucide-react';

export default function CampaignDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params?.campaignId as string;
  const { user, advertiser, needsProfile } = useRequireAdvertiser();
  
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [insights, setInsights] = useState<CampaignInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Redirect if needs profile
  useEffect(() => {
    if (!needsProfile) return;
    router.push('/brands/settings');
  }, [needsProfile, router]);

  // Load campaign and insights
  useEffect(() => {
    if (!user || !campaignId) return;

    const loadData = async () => {
      try {
        const [campaignData, insightsData] = await Promise.all([
          getCampaign(campaignId),
          getCampaignInsights(campaignId),
        ]);

        if (!campaignData) {
          setError('Campaign not found');
          return;
        }

        // Verify ownership
        if (campaignData.brandId !== user.uid) {
          setError('Unauthorized: Not your campaign');
          return;
        }

        setCampaign(campaignData);
        setInsights(insightsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load campaign');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, campaignId]);

  const handlePauseResume = async () => {
    if (!campaign) return;

    setActionLoading(true);
    try {
      if (campaign.status === 'active') {
        await pauseCampaign(campaign.campaignId);
        setCampaign({ ...campaign, status: 'paused' });
      } else if (campaign.status === 'paused') {
        await resumeCampaign(campaign.campaignId);
        setCampaign({ ...campaign, status: 'active' });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update campaign');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error || !campaign || !insights) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Campaign Not Found'}
          </h2>
          <button onClick={() => router.push('/brands/campaigns')} className="btn-primary">
            Back to Campaigns
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-gray-900">{campaign.title}</h1>
                <span
                  className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(
                    campaign.status
                  )}`}
                >
                  {campaign.status}
                </span>
              </div>
              <p className="text-gray-600">
                {campaign.campaignType} • {campaign.placements.join(', ')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/brands/campaigns')}
                className="btn-secondary"
              >
                All Campaigns
              </button>
              {(campaign.status === 'active' || campaign.status === 'paused') && (
                <button
                  onClick={handlePauseResume}
                  disabled={actionLoading}
                  className={`${
                    campaign.status === 'active' ? 'btn-secondary' : 'btn-primary'
                  } flex items-center gap-2`}
                >
                  {campaign.status === 'active' ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Resume
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-gray-600 mb-1">Impressions</p>
                <p className="text-3xl font-bold text-blue-600">
                  {insights.totalImpressions.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-gray-600 mb-1">Clicks</p>
                <p className="text-3xl font-bold text-green-600">
                  {insights.totalClicks.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <MousePointer className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-gray-600 mb-1">CTR</p>
                <p className="text-3xl font-bold text-purple-600">{insights.ctr}%</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Click-through rate</p>
          </div>

          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-gray-600 mb-1">Budget Used</p>
                <p className="text-3xl font-bold text-gray-900">{insights.budgetUtilization}%</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(insights.budgetUtilization) >= 90
                    ? 'bg-red-500'
                    : parseFloat(insights.budgetUtilization) >= 70
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(parseFloat(insights.budgetUtilization), 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Budget & Spend */}
        <div className="card mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Budget Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Budget</p>
              <p className="text-2xl font-bold text-gray-900">
                {campaign.budgetTokens.toLocaleString()} 🪙
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Spent</p>
              <p className="text-2xl font-bold text-red-600">
                {insights.spentTokens.toLocaleString()} 🪙
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Remaining</p>
              <p className="text-2xl font-bold text-green-600">
                {insights.remainingBudget.toLocaleString()} 🪙
              </p>
            </div>
          </div>
        </div>

        {/* Performance Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* By Placement */}
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Performance by Placement</h3>
            <div className="space-y-3">
              {Object.entries(insights.impressionsByPlacement).map(([placement, count]) => (
                <div key={placement} className="flex items-center justify-between">
                  <span className="capitalize font-medium text-gray-700">{placement}</span>
                  <span className="text-gray-900 font-semibold">{count?.toLocaleString() || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By User Tier */}
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Performance by User Tier</h3>
            <div className="space-y-3">
              {Object.entries(insights.impressionsByTier).map(([tier, count]) => (
                <div key={tier} className="flex items-center justify-between">
                  <span className="capitalize font-medium text-gray-700">{tier}</span>
                  <span className="text-gray-900 font-semibold">{count?.toLocaleString() || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Campaign Details */}
        <div className="card">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Campaign Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Basic Information</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Campaign ID:</dt>
                  <dd className="font-mono text-gray-900">{campaign.campaignId.slice(0, 8)}...</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Type:</dt>
                  <dd className="font-semibold text-gray-900">{campaign.campaignType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Call to Action:</dt>
                  <dd className="text-gray-900">{campaign.callToAction}</dd>
                </div>
                {campaign.targetUrl && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Destination:</dt>
                    <dd className="text-blue-600 hover:underline">
                      <a href={campaign.targetUrl} target="_blank" rel="noopener noreferrer">
                        View →
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Targeting</h4>
              <dl className="space-y-2 text-sm">
                {campaign.targeting.countries && campaign.targeting.countries.length > 0 && (
                  <div>
                    <dt className="text-gray-600 mb-1">Countries:</dt>
                    <dd className="text-gray-900">{campaign.targeting.countries.join(', ')}</dd>
                  </div>
                )}
                {campaign.targeting.tiers && campaign.targeting.tiers.length > 0 && (
                  <div>
                    <dt className="text-gray-600 mb-1">User Tiers:</dt>
                    <dd className="text-gray-900">
                      {campaign.targeting.tiers.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}
                    </dd>
                  </div>
                )}
                {campaign.targeting.ageMin && campaign.targeting.ageMax && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Age Range:</dt>
                    <dd className="text-gray-900">
                      {campaign.targeting.ageMin} - {campaign.targeting.ageMax}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-600">Placements:</dt>
                  <dd className="text-gray-900">{campaign.placements.join(', ')}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Description */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-700 mb-2">Description</h4>
            <p className="text-gray-900">{campaign.description}</p>
          </div>

          {/* Creative */}
          {campaign.imageUrl && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="font-semibold text-gray-700 mb-3">Ad Creative</h4>
              <div className="max-w-md">
                <img
                  src={campaign.imageUrl}
                  alt={campaign.title}
                  className="w-full rounded-lg border border-gray-300"
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/600x315?text=Ad+Image';
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Performance Tips */}
        <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 mt-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">💡 Performance Tips</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            {parseFloat(insights.ctr) < 1 && (
              <li>• Your CTR is below 1%. Consider updating your ad creative or targeting.</li>
            )}
            {parseFloat(insights.budgetUtilization) > 80 && (
              <li>• Budget is running low. Consider adding more tokens to keep your campaign active.</li>
            )}
            {parseFloat(insights.ctr) > 3 && (
              <li>• Great CTR! Your ad is performing well with the current audience.</li>
            )}
            {insights.totalClicks === 0 && insights.totalImpressions > 100 && (
              <li>• No clicks yet after {insights.totalImpressions} impressions. Try a stronger call-to-action.</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}