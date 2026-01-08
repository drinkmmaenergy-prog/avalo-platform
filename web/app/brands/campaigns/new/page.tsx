/**
 * New Campaign Wizard - Phase 19A
 * Multi-step campaign creation interface
 */

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAdvertiser } from '@/lib/hooks/useAdvertiser';
import { createCampaign } from '@/lib/services/adsClient';
import { CreateCampaignRequest, AdPlacement, UserTier } from '@/lib/types/advertiser';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

type WizardStep = 1 | 2 | 3;

const COUNTRIES = ['US', 'UK', 'DE', 'FR', 'ES', 'IT', 'PL', 'NL', 'SE', 'NO'];
const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'sv', 'no'];
const PLACEMENTS: AdPlacement[] = ['feed', 'swipe', 'live'];
const TIERS: UserTier[] = ['standard', 'vip', 'royal'];

export default function NewCampaignPage() {
  const router = useRouter();
  const { user, advertiser, needsProfile } = useRequireAdvertiser();
  const [step, setStep] = useState<WizardStep>(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<CreateCampaignRequest>({
    title: '',
    description: '',
    imageUrl: '',
    targetUrl: '',
    callToAction: 'Learn More',
    budgetTokens: 500,
    campaignType: 'CPM',
    costPerClick: 5,
    costPerImpression: 50,
    placements: ['feed'],
    targeting: {
      countries: [],
      languages: [],
      ageMin: 18,
      ageMax: 65,
      genders: [],
      tiers: [],
      interests: [],
    },
  });

  if (needsProfile) {
    router.push('/brands/settings');
    return null;
  }

  const handleSubmit = async () => {
    setCreating(true);
    setError(null);

    try {
      const campaign = await createCampaign(formData);
      router.push(`/brands/campaigns/${campaign.campaignId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign');
      setCreating(false);
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return !!(formData.title && formData.description && formData.imageUrl);
      case 2:
        return formData.placements.length > 0;
      case 3:
        return formData.budgetTokens >= 100;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Campaign</h1>
              <p className="text-gray-600 mt-1">Step {step} of 3</p>
            </div>
            <button
              onClick={() => router.push('/brands/campaigns')}
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    s < step
                      ? 'bg-green-500 text-white'
                      : s === step
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      s < step ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-600">Basic Info</span>
            <span className="text-xs text-gray-600">Targeting</span>
            <span className="text-xs text-gray-600">Budget</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Basic Information</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Summer Sale 2025"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Get 50% off on all products this summer!"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Recommended: 1200x630px, max 5MB
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destination URL
                </label>
                <input
                  type="url"
                  value={formData.targetUrl}
                  onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="https://yoursite.com/landing-page"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Call to Action
                </label>
                <select
                  value={formData.callToAction}
                  onChange={(e) => setFormData({ ...formData, callToAction: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option>Learn More</option>
                  <option>Shop Now</option>
                  <option>Sign Up</option>
                  <option>Get Started</option>
                  <option>Download</option>
                  <option>Book Now</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Targeting */}
        {step === 2 && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Targeting</h2>

            <div className="space-y-6">
              {/* Placements */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ad Placements <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {PLACEMENTS.map((placement) => (
                    <label
                      key={placement}
                      className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer ${
                        formData.placements.includes(placement)
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.placements.includes(placement)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              placements: [...formData.placements, placement],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              placements: formData.placements.filter((p) => p !== placement),
                            });
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="capitalize font-medium">{placement}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Countries */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Countries (leave empty for all)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {COUNTRIES.map((country) => (
                    <label key={country} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.targeting.countries?.includes(country)}
                        onChange={(e) => {
                          const current = formData.targeting.countries || [];
                          setFormData({
                            ...formData,
                            targeting: {
                              ...formData.targeting,
                              countries: e.target.checked
                                ? [...current, country]
                                : current.filter((c) => c !== country),
                            },
                          });
                        }}
                        className="mr-1"
                      />
                      <span className="text-sm">{country}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* User Tiers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Tiers (leave empty for all)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {TIERS.map((tier) => (
                    <label
                      key={tier}
                      className={`flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer ${
                        formData.targeting.tiers?.includes(tier)
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.targeting.tiers?.includes(tier)}
                        onChange={(e) => {
                          const current = formData.targeting.tiers || [];
                          setFormData({
                            ...formData,
                            targeting: {
                              ...formData.targeting,
                              tiers: e.target.checked
                                ? [...current, tier]
                                : current.filter((t) => t !== tier),
                            },
                          });
                        }}
                        className="mr-2"
                      />
                      <span className="capitalize">{tier}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Age Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Age Range
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={formData.targeting.ageMin}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        targeting: { ...formData.targeting, ageMin: parseInt(e.target.value) },
                      })
                    }
                    className="w-24 px-4 py-2 border border-gray-300 rounded-lg"
                    min="18"
                    max="100"
                  />
                  <span>to</span>
                  <input
                    type="number"
                    value={formData.targeting.ageMax}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        targeting: { ...formData.targeting, ageMax: parseInt(e.target.value) },
                      })
                    }
                    className="w-24 px-4 py-2 border border-gray-300 rounded-lg"
                    min="18"
                    max="100"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Budget */}
        {step === 3 && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Budget & Billing</h2>

            <div className="space-y-6">
              {/* Campaign Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Model
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label
                    className={`p-4 border-2 rounded-lg cursor-pointer ${
                      formData.campaignType === 'CPM'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={formData.campaignType === 'CPM'}
                      onChange={() =>
                        setFormData({ ...formData, campaignType: 'CPM', costPerImpression: 50 })
                      }
                      className="mr-2"
                    />
                    <div>
                      <div className="font-semibold">CPM - Cost Per 1000 Impressions</div>
                      <div className="text-sm text-gray-600">Default: 50 tokens / 1K views</div>
                      <div className="text-xs text-gray-500 mt-1">Best for brand awareness</div>
                    </div>
                  </label>

                  <label
                    className={`p-4 border-2 rounded-lg cursor-pointer ${
                      formData.campaignType === 'CPC'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={formData.campaignType === 'CPC'}
                      onChange={() =>
                        setFormData({ ...formData, campaignType: 'CPC', costPerClick: 5 })
                      }
                      className="mr-2"
                    />
                    <div>
                      <div className="font-semibold">CPC - Cost Per Click</div>
                      <div className="text-sm text-gray-600">Default: 5 tokens / click</div>
                      <div className="text-xs text-gray-500 mt-1">Best for conversions</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Budget (tokens) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.budgetTokens}
                  onChange={(e) =>
                    setFormData({ ...formData, budgetTokens: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  min="100"
                  step="50"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum: 100 tokens</p>
              </div>

              {/* Daily Cap */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Daily Spending Cap (optional)
                </label>
                <input
                  type="number"
                  value={formData.dailyCap || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      dailyCap: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  min="10"
                  placeholder="No daily limit"
                />
              </div>

              {/* Estimated Reach */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Estimated Reach</h4>
                {formData.campaignType === 'CPM' ? (
                  <p className="text-sm text-blue-800">
                    ~{((formData.budgetTokens / 50) * 1000).toLocaleString()} impressions
                  </p>
                ) : (
                  <p className="text-sm text-blue-800">
                    ~{(formData.budgetTokens / 5).toLocaleString()} clicks
                  </p>
                )}
                <p className="text-xs text-blue-600 mt-1">
                  Actual results may vary based on targeting and ad performance
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as WizardStep)}
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as WizardStep)}
              disabled={!canProceed()}
              className="btn-primary flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || creating}
              className="btn-primary px-8"
            >
              {creating ? 'Creating...' : 'Create Campaign'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}