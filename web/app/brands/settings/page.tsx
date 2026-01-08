/**
 * Advertiser Settings Page - Phase 19A
 * Create/edit advertiser profile
 */

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/useAdvertiser';
import {
  getCurrentAdvertiserProfile,
  createAdvertiserProfile,
  updateAdvertiserProfile,
} from '@/lib/services/advertiserService';
import { AdvertiserProfile } from '@/lib/types/advertiser';

export default function AdvertiserSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useRequireAuth();
  const [advertiser, setAdvertiser] = useState<AdvertiserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    websiteUrl: '',
    vatId: '',
  });

  // Load existing advertiser profile
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      try {
        const profile = await getCurrentAdvertiserProfile(user.uid);
        if (profile) {
          setAdvertiser(profile);
          setFormData({
            companyName: profile.companyName || '',
            contactName: profile.contactName || '',
            contactEmail: profile.contactEmail || '',
            websiteUrl: profile.websiteUrl || '',
            vatId: profile.vatId || '',
          });
        } else {
          // Pre-fill email from user
          setFormData((prev) => ({
            ...prev,
            contactEmail: user.email || '',
          }));
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation
    if (!formData.companyName || !formData.contactName || !formData.contactEmail) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (advertiser) {
        // Update existing profile
        await updateAdvertiserProfile(user.uid, {
          companyName: formData.companyName,
          contactName: formData.contactName,
          contactEmail: formData.contactEmail,
          websiteUrl: formData.websiteUrl || undefined,
          vatId: formData.vatId || undefined,
        });
      } else {
        // Create new profile
        await createAdvertiserProfile(user.uid, {
          companyName: formData.companyName,
          contactName: formData.contactName,
          contactEmail: formData.contactEmail,
          websiteUrl: formData.websiteUrl || undefined,
          vatId: formData.vatId || undefined,
        });
      }

      // Redirect to campaigns page
      router.push('/brands/campaigns');
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Check if blocked
  if (advertiser?.status === 'blocked') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Advertiser Settings</h1>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card bg-red-50 border-red-200">
            <h2 className="text-xl font-semibold text-red-900 mb-2">
              Account Blocked
            </h2>
            <p className="text-red-800 mb-4">
              Your advertiser account has been blocked. Please contact support for assistance.
            </p>
            {advertiser.notes && (
              <p className="text-sm text-red-700 bg-red-100 p-3 rounded">
                <strong>Reason:</strong> {advertiser.notes}
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {advertiser ? 'Advertiser Settings' : 'Create Advertiser Account'}
              </h1>
              <p className="text-gray-600 mt-1">
                {advertiser
                  ? 'Manage your company information'
                  : 'Set up your advertiser profile to start creating campaigns'}
              </p>
            </div>
            <button
              onClick={() => router.push('/brands/campaigns')}
              className="btn-secondary"
            >
              {advertiser ? 'Back to Campaigns' : 'Cancel'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="card">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Company Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Your Company LLC"
              required
            />
          </div>

          {/* Contact Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) =>
                setFormData({ ...formData, contactName: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="John Doe"
              required
            />
          </div>

          {/* Contact Email */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) =>
                setFormData({ ...formData, contactEmail: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="john@company.com"
              required
            />
          </div>

          {/* Website URL */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Website URL
            </label>
            <input
              type="url"
              value={formData.websiteUrl}
              onChange={(e) =>
                setFormData({ ...formData, websiteUrl: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://www.company.com"
            />
          </div>

          {/* VAT ID */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              VAT ID / Tax Number
            </label>
            <input
              type="text"
              value={formData.vatId}
              onChange={(e) =>
                setFormData({ ...formData, vatId: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="EU123456789"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional, for invoicing purposes
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? (
                <span className="flex items-center justify-center">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </span>
              ) : advertiser ? (
                'Save Changes'
              ) : (
                'Create Account'
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push(advertiser ? '/brands/campaigns' : '/brands')}
              className="btn-secondary px-6"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="card bg-blue-50 border-blue-200 mt-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            💡 About Your Profile
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Your profile information is used for account management</li>
            <li>• Contact details will be used for campaign communications</li>
            <li>• VAT ID is optional but recommended for EU businesses</li>
            <li>• You can update this information anytime</li>
          </ul>
        </div>
      </main>
    </div>
  );
}