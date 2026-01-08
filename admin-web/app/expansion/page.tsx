/**
 * PACK 425 — Expansion Dashboard
 * Admin interface for global country rollout management
 */

'use client';

import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface CountryProfile {
  countryCode: string;
  region: string;
  languageCodes: string[];
  currency: string;
  launchReadiness: number;
  recommendedLaunchStrategy: string;
  asoScore: number;
  trustScore: number;
  fraudRiskScore: number;
  paymentProviderReady: boolean;
  supportCoverageReady: boolean;
  legalRiskLevel: string;
}

interface DashboardData {
  summary: {
    totalCountries: number;
    aggressive: number;
    steady: number;
    cautious: number;
    deferred: number;
  };
  countries: CountryProfile[];
}

export default function ExpansionDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const getExpansionDashboard = httpsCallable(functions, 'getExpansionDashboard');
      const result = await getExpansionDashboard({});
      setData(result.data as DashboardData);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStrategyColor = (strategy: string) => {
    const colors: { [key: string]: string } = {
      AGGRESSIVE: 'bg-green-500',
      STEADY: 'bg-blue-500',
      CAUTIOUS: 'bg-yellow-500',
      DEFER: 'bg-gray-500',
    };
    return colors[strategy] ?? 'bg-gray-400';
  };

  const getReadinessColor = (score: number) => {
    if (score > 0.75) return 'text-green-600';
    if (score > 0.55) return 'text-blue-600';
    if (score > 0.35) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredCountries = data?.countries.filter(c => 
    filter === 'ALL' || c.recommendedLaunchStrategy === filter
  ) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading expansion dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🌍 Global Expansion Dashboard</h1>
          <p className="text-gray-600 mt-2">PACK 425 — Country Rollout Orchestration</p>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Total Countries</div>
              <div className="text-3xl font-bold text-gray-900">{data.summary.totalCountries}</div>
            </div>
            <div className="bg-green-50 p-6 rounded-lg shadow">
              <div className="text-sm text-green-600">Aggressive</div>
              <div className="text-3xl font-bold text-green-700">{data.summary.aggressive}</div>
              <div className="text-xs text-green-600">Launch Ready</div>
            </div>
            <div className="bg-blue-50 p-6 rounded-lg shadow">
              <div className="text-sm text-blue-600">Steady</div>
              <div className="text-3xl font-bold text-blue-700">{data.summary.steady}</div>
              <div className="text-xs text-blue-600">In Preparation</div>
            </div>
            <div className="bg-yellow-50 p-6 rounded-lg shadow">
              <div className="text-sm text-yellow-600">Cautious</div>
              <div className="text-3xl font-bold text-yellow-700">{data.summary.cautious}</div>
              <div className="text-xs text-yellow-600">A/B Testing</div>
            </div>
            <div className="bg-gray-50 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Deferred</div>
              <div className="text-3xl font-bold text-gray-700">{data.summary.deferred}</div>
              <div className="text-xs text-gray-600">Not Ready</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-2">
            {['ALL', 'AGGRESSIVE', 'STEADY', 'CAUTIOUS', 'DEFER'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Countries Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Country
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Region
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Readiness
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Strategy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCountries.map((country) => (
                <tr key={country.countryCode} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-2xl mr-3">
                        {getFlagEmoji(country.countryCode)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {country.countryCode}
                        </div>
                        <div className="text-xs text-gray-500">
                          {country.languageCodes.join(', ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {country.region}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-lg font-bold ${getReadinessColor(country.launchReadiness)}`}>
                      {Math.round(country.launchReadiness * 100)}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full ${getStrategyColor(country.recommendedLaunchStrategy)}`}
                        style={{ width: `${country.launchReadiness * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStrategyColor(country.recommendedLaunchStrategy)} text-white`}>
                      {country.recommendedLaunchStrategy}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex flex-col gap-1">
                      <StatusBadge 
                        label="Payment" 
                        status={country.paymentProviderReady} 
                      />
                      <StatusBadge 
                        label="Support" 
                        status={country.supportCoverageReady} 
                      />
                      <StatusBadge 
                        label="Legal" 
                        status={country.legalRiskLevel === 'LOW'} 
                        warning={country.legalRiskLevel === 'MEDIUM'}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a
                      href={`/expansion/${country.countryCode}`}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      View
                    </a>
                    <button className="text-green-600 hover:text-green-900">
                      Launch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ label, status, warning }: { label: string; status: boolean; warning?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${status ? 'bg-green-500' : warning ? 'bg-yellow-500' : 'bg-red-500'}`} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

function getFlagEmoji(countryCode: string): string {
  const flags: { [key: string]: string } = {
    PL: '🇵🇱', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰',
    FR: '🇫🇷', GB: '🇬🇧', ES: '🇪🇸', IT: '🇮🇹',
    SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮',
    US: '🇺🇸', CA: '🇨🇦', MX: '🇲🇽', BR: '🇧🇷', AR: '🇦🇷',
    AE: '🇦🇪', SA: '🇸🇦',
    JP: '🇯🇵', KR: '🇰🇷', AU: '🇦🇺', NZ: '🇳🇿', IN: '🇮🇳',
  };
  return flags[countryCode] ?? '🌍';
}
