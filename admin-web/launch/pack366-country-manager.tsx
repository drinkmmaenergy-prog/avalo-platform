/**
 * ✅ PACK 366 — Country Launch Manager
 * Admin UI for managing country-by-country rollout
 */

import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface CountryLaunchConfig {
  isoCode: string;
  enabled: boolean;
  discoveryVisible: boolean;
  paymentsEnabled: boolean;
  withdrawalsEnabled: boolean;
  adsEnabled: boolean;
  launchStage: 'locked' | 'soft' | 'vip' | 'public';
  maxNewUsersPerDay?: number;
  timezone: string;
  createdAt: number;
  updatedAt: number;
  launchedAt?: number;
  lockedReason?: string;
}

interface CountryStats {
  isoCode: string;
  registrations: number;
  activeUsers: number;
  revenue: number;
}

export default function Pack366CountryManager() {
  const [countries, setCountries] = useState<CountryLaunchConfig[]>([]);
  const [stats, setStats] = useState<Record<string, CountryStats>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<CountryLaunchConfig | null>(null);
  const [newCountryCode, setNewCountryCode] = useState('');

  useEffect(() => {
    loadCountries();
    loadStats();
  }, []);

  const loadCountries = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, 'ops', 'countryLaunch', 'countries')
      );
      const countriesData = snapshot.docs.map(
        (doc) => doc.data() as CountryLaunchConfig
      );
      setCountries(countriesData.sort((a, b) => a.isoCode.localeCompare(b.isoCode)));
      setLoading(false);
    } catch (error) {
      console.error('Error loading countries:', error);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const statsData: Record<string, CountryStats> = {};
      
      // Load stats for each country (simplified - in real app would batch this)
      for (const country of countries) {
        const docRef = doc(
          db,
          'analytics',
          'countryLaunch',
          country.isoCode,
          today
        );
        // Would fetch here, but simplified for now
        statsData[country.isoCode] = {
          isoCode: country.isoCode,
          registrations: 0,
          activeUsers: 0,
          revenue: 0,
        };
      }
      
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const updateCountryStage = async (
    isoCode: string,
    newStage: CountryLaunchConfig['launchStage']
  ) => {
    try {
      const countryRef = doc(db, 'ops', 'countryLaunch', 'countries', isoCode);
      await updateDoc(countryRef, {
        launchStage: newStage,
        updatedAt: Date.now(),
        ...(newStage === 'public' && { launchedAt: Date.now() }),
      });
      
      await loadCountries();
      alert(`${isoCode} transitioned to ${newStage}`);
    } catch (error) {
      console.error('Error updating stage:', error);
      alert('Failed to update stage');
    }
  };

  const toggleCountryEnabled = async (isoCode: string, enabled: boolean) => {
    try {
      const countryRef = doc(db, 'ops', 'countryLaunch', 'countries', isoCode);
      await updateDoc(countryRef, {
        enabled,
        updatedAt: Date.now(),
      });
      
      await loadCountries();
    } catch (error) {
      console.error('Error toggling country:', error);
      alert('Failed to toggle country');
    }
  };

  const addCountry = async () => {
    if (!newCountryCode || newCountryCode.length !== 2) {
      alert('Please enter a valid 2-letter country code');
      return;
    }

    const config: CountryLaunchConfig = {
      isoCode: newCountryCode.toUpperCase(),
      enabled: false,
      discoveryVisible: false,
      paymentsEnabled: false,
      withdrawalsEnabled: false,
      adsEnabled: false,
      launchStage: 'locked',
      timezone: 'UTC',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const countryRef = doc(
        db,
        'ops',
        'countryLaunch',
        'countries',
        config.isoCode
      );
      await setDoc(countryRef, config);
      
      setNewCountryCode('');
      await loadCountries();
      alert(`Country ${config.isoCode} added`);
    } catch (error) {
      console.error('Error adding country:', error);
      alert('Failed to add country');
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'locked':
        return 'bg-gray-500';
      case 'soft':
        return 'bg-yellow-500';
      case 'vip':
        return 'bg-purple-500';
      case 'public':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'locked':
        return '🔒';
      case 'soft':
        return '🔸';
      case 'vip':
        return '👑';
      case 'public':
        return '🚀';
      default:
        return '❓';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading countries...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          🌍 Country Launch Manager
        </h1>
        <p className="text-gray-600">
          Manage country-by-country rollout and launch stages
        </p>
      </div>

      {/* Add Country Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Country</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={newCountryCode}
            onChange={(e) => setNewCountryCode(e.target.value.toUpperCase())}
            placeholder="Country Code (e.g., PL, DE, UA)"
            maxLength={2}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={addCountry}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Country
          </button>
        </div>
      </div>

      {/* Countries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {countries.map((country) => (
          <div
            key={country.isoCode}
            className="bg-white rounded-lg shadow-lg overflow-hidden"
          >
            {/* Header */}
            <div
              className={`${getStageColor(
                country.launchStage
              )} text-white p-4`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getStageIcon(country.launchStage)}</span>
                  <div>
                    <h3 className="text-xl font-bold">{country.isoCode}</h3>
                    <p className="text-sm opacity-90 capitalize">
                      {country.launchStage}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={country.enabled}
                    onChange={(e) =>
                      toggleCountryEnabled(country.isoCode, e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white"></div>
                </label>
              </div>
            </div>

            {/* Stats */}
            <div className="p-4 bg-gray-50">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-600">Registrations</div>
                  <div className="font-semibold">
                    {stats[country.isoCode]?.registrations || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Active Users</div>
                  <div className="font-semibold">
                    {stats[country.isoCode]?.activeUsers || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Revenue</div>
                  <div className="font-semibold">
                    ${stats[country.isoCode]?.revenue || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="p-4">
              <div className="space-y-2 mb-4">
                {[
                  { key: 'discoveryVisible', label: 'Discovery' },
                  { key: 'paymentsEnabled', label: 'Payments' },
                  { key: 'withdrawalsEnabled', label: 'Withdrawals' },
                  { key: 'adsEnabled', label: 'Ads' },
                ].map((feature) => (
                  <div
                    key={feature.key}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">{feature.label}</span>
                    <span>
                      {country[feature.key as keyof CountryLaunchConfig] ? '✅' : '❌'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Stage Transition Buttons */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  Change Stage:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['locked', 'soft', 'vip', 'public'] as const).map((stage) => (
                    <button
                      key={stage}
                      onClick={() => updateCountryStage(country.isoCode, stage)}
                      disabled={country.launchStage === stage}
                      className={`px-3 py-2 rounded text-xs font-medium ${
                        country.launchStage === stage
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {getStageIcon(stage)} {stage.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Info */}
            {country.launchedAt && (
              <div className="px-4 pb-4">
                <div className="text-xs text-gray-500">
                  Launched: {new Date(country.launchedAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Global Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['locked', 'soft', 'vip', 'public'] as const).map((stage) => {
            const count = countries.filter((c) => c.launchStage === stage).length;
            return (
              <div key={stage} className="text-center">
                <div className={`${getStageColor(stage)} text-white rounded-lg p-4`}>
                  <div className="text-3xl mb-2">{getStageIcon(stage)}</div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-sm capitalize">{stage}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
