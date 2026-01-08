/**
 * ✅ PACK 366 — Ad Campaign Control
 * Admin UI for managing advertising campaigns and synchronization
 */

import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AdLaunchWindow {
  id: string;
  platform: 'meta' | 'google' | 'tiktok' | 'snap';
  country: string;
  startAt: number;
  endAt: number;
  expectedCPI: number;
  dailyBudget: number;
  totalBudget: number;
  spentToDate: number;
  installsToDate: number;
  active: boolean;
  autoSync: boolean;
  createdAt: number;
  updatedAt: number;
}

export default function Pack366AdControl() {
  const [campaigns, setCampaigns] = useState<AdLaunchWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    platform: 'meta' as AdLaunchWindow['platform'],
    country: '',
    expectedCPI: 2.5,
    dailyBudget: 1000,
    totalBudget: 30000,
    durationDays: 30,
    autoSync: true,
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, 'ops', 'adCampaigns', 'campaigns')
      );
      const campaignsData = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as AdLaunchWindow[];
      
      setCampaigns(
        campaignsData.sort((a, b) => b.createdAt - a.createdAt)
      );
      setLoading(false);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      setLoading(false);
    }
  };

  const createCampaign = async () => {
    try {
      const now = Date.now();
      const campaign: Omit<AdLaunchWindow, 'id'> = {
        platform: formData.platform,
        country: formData.country.toUpperCase(),
        startAt: now,
        endAt: now + formData.durationDays * 24 * 60 * 60 * 1000,
        expectedCPI: formData.expectedCPI,
        dailyBudget: formData.dailyBudget,
        totalBudget: formData.totalBudget,
        spentToDate: 0,
        installsToDate: 0,
        active: false,
        autoSync: formData.autoSync,
        createdAt: now,
        updatedAt: now,
      };

      await addDoc(collection(db, 'ops', 'adCampaigns', 'campaigns'), campaign);
      
      setShowCreateForm(false);
      await loadCampaigns();
      alert('Campaign created successfully');
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign');
    }
  };

  const toggleCampaignActive = async (campaignId: string, active: boolean) => {
    try {
      const campaignRef = doc(db, 'ops', 'adCampaigns', 'campaigns', campaignId);
      await updateDoc(campaignRef, {
        active,
        updatedAt: Date.now(),
      });
      
      await loadCampaigns();
    } catch (error) {
      console.error('Error toggling campaign:', error);
      alert('Failed to toggle campaign');
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'meta':
        return '📘';
      case 'google':
        return '🔍';
      case 'tiktok':
        return '🎵';
      case 'snap':
        return '👻';
      default:
        return '📱';
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'meta':
        return 'bg-blue-600';
      case 'google':
        return 'bg-red-600';
      case 'tiktok':
        return 'bg-black';
      case 'snap':
        return 'bg-yellow-400';
      default:
        return 'bg-gray-600';
    }
  };

  const getActualCPI = (campaign: AdLaunchWindow) => {
    if (campaign.installsToDate === 0) return 0;
    return campaign.spentToDate / campaign.installsToDate;
  };

  const getBudgetUsedPercentage = (campaign: AdLaunchWindow) => {
    return (campaign.spentToDate / campaign.totalBudget) * 100;
  };

  const getPerformanceIndicator = (campaign: AdLaunchWindow) => {
    const actualCPI = getActualCPI(campaign);
    if (actualCPI === 0) return '⚪';
    if (actualCPI <= campaign.expectedCPI) return '🟢';
    if (actualCPI <= campaign.expectedCPI * 1.2) return '🟡';
    return '🔴';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              📢 Ad Campaign Control
            </h1>
            <p className="text-gray-600">
              Manage advertising campaigns and launch synchronization
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            {showCreateForm ? 'Cancel' : '+ New Campaign'}
          </button>
        </div>
      </div>

      {/* Create Campaign Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Create New Campaign</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Platform</label>
              <select
                value={formData.platform}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    platform: e.target.value as AdLaunchWindow['platform'],
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="meta">Meta (Facebook/Instagram)</option>
                <option value="google">Google Ads</option>
                <option value="tiktok">TikTok</option>
                <option value="snap">Snapchat</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Country Code
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    country: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g., PL, DE, UA"
                maxLength={2}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Expected CPI ($)
              </label>
              <input
                type="number"
                value={formData.expectedCPI}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    expectedCPI: parseFloat(e.target.value),
                  })
                }
                step="0.1"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Daily Budget ($)
              </label>
              <input
                type="number"
                value={formData.dailyBudget}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dailyBudget: parseFloat(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Total Budget ($)
              </label>
              <input
                type="number"
                value={formData.totalBudget}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    totalBudget: parseFloat(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Duration (Days)
              </label>
              <input
                type="number"
                value={formData.durationDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    durationDays: parseInt(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.autoSync}
                  onChange={(e) =>
                    setFormData({ ...formData, autoSync: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">
                  Auto-sync with country launch stage
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={createCampaign}
              disabled={!formData.country}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              Create Campaign
            </button>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📢</div>
          <h3 className="text-xl font-semibold mb-2">No campaigns yet</h3>
          <p className="text-gray-600">
            Create your first ad campaign to start tracking
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-white rounded-lg shadow-lg overflow-hidden"
            >
              {/* Header */}
              <div
                className={`${getPlatformColor(campaign.platform)} text-white p-4`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getPlatformIcon(campaign.platform)}</span>
                    <div>
                      <h3 className="text-xl font-bold">
                        {campaign.platform.toUpperCase()} - {campaign.country}
                      </h3>
                      <p className="text-sm opacity-90">
                        {campaign.active ? '🟢 Active' : '⚪ Inactive'}
                      </p>
                    </div>
                  </div>
                  <div className="text-2xl">{getPerformanceIndicator(campaign)}</div>
                </div>
              </div>

              {/* Stats */}
              <div className="p-4 bg-gray-50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-600">Installs</div>
                    <div className="font-bold text-lg">
                      {campaign.installsToDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Spent</div>
                    <div className="font-bold text-lg">
                      ${campaign.spentToDate.toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Actual CPI</div>
                    <div className="font-bold text-lg">
                      ${getActualCPI(campaign).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Budget Progress */}
              <div className="p-4">
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Budget Usage</span>
                    <span className="font-semibold">
                      {getBudgetUsedPercentage(campaign).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${
                        getBudgetUsedPercentage(campaign) >= 90
                          ? 'bg-red-600'
                          : getBudgetUsedPercentage(campaign) >= 70
                          ? 'bg-yellow-500'
                          : 'bg-green-600'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          getBudgetUsedPercentage(campaign)
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <span className="text-gray-600">Expected CPI:</span>
                    <span className="font-semibold ml-2">
                      ${campaign.expectedCPI.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Daily Budget:</span>
                    <span className="font-semibold ml-2">
                      ${campaign.dailyBudget}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Budget:</span>
                    <span className="font-semibold ml-2">
                      ${campaign.totalBudget}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Auto-sync:</span>
                    <span className="ml-2">{campaign.autoSync ? '✅' : '❌'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-gray-500 mb-3">
                    Start: {new Date(campaign.startAt).toLocaleDateString()} •
                    End: {new Date(campaign.endAt).toLocaleDateString()}
                  </div>
                  <button
                    onClick={() =>
                      toggleCampaignActive(campaign.id, !campaign.active)
                    }
                    className={`w-full py-2 rounded-lg font-semibold ${
                      campaign.active
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {campaign.active ? '⏸ Pause Campaign' : '▶️ Start Campaign'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {campaigns.length > 0 && (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Campaign Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">
                {campaigns.length}
              </div>
              <div className="text-sm text-gray-600">Total Campaigns</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600">
                {campaigns.filter((c) => c.active).length}
              </div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600">
                {campaigns.reduce((sum, c) => sum + c.installsToDate, 0)}
              </div>
              <div className="text-sm text-gray-600">Total Installs</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-3xl font-bold text-orange-600">
                ${campaigns
                  .reduce((sum, c) => sum + c.spentToDate, 0)
                  .toFixed(0)}
              </div>
              <div className="text-sm text-gray-600">Total Spent</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
