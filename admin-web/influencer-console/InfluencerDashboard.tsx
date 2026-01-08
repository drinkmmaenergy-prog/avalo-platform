/**
 * PACK 393: Influencer Dashboard Component
 * Main dashboard for influencer partners
 */

import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface InfluencerStats {
  totalClicks: number;
  totalInstalls: number;
  totalRegistrations: number;
  totalVerifiedUsers: number;
  totalRevenue: number;
  totalPayouts: number;
}

interface InfluencerData {
  partner: {
    name: string;
    referralCode: string;
    payoutModel: 'CPA' | 'CPL' | 'RevShare';
    status: string;
    stats: InfluencerStats;
  };
  recentEvents: Record<string, number>;
  pendingPayouts: number;
  fraudScore: number;
}

export const InfluencerDashboard: React.FC = () => {
  const [data, setData] = useState<InfluencerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const functions = getFunctions();
      const getDashboard = httpsCallable(functions, 'pack393_getInfluencerDashboard');
      const result = await getDashboard();
      setData(result.data as InfluencerData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-lg m-6">
        <h3 className="font-bold mb-2">Error Loading Dashboard</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const conversionRate = data.partner.stats.totalInstalls > 0
    ? (data.partner.stats.totalVerifiedUsers / data.partner.stats.totalInstalls * 100).toFixed(2)
    : '0.00';

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Influencer Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome back, {data.partner.name}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Your Referral Code</div>
            <div className="text-2xl font-mono font-bold text-blue-600">{data.partner.referralCode}</div>
            <div className="text-xs text-gray-500 mt-1">
              Model: {data.partner.payoutModel} · Status: {data.partner.status}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Clicks"
          value={data.partner.stats.totalClicks.toLocaleString()}
          icon="👆"
          color="blue"
        />
        <StatCard
          title="App Installs"
          value={data.partner.stats.totalInstalls.toLocaleString()}
          icon="📱"
          color="green"
        />
        <StatCard
          title="Verified Users"
          value={data.partner.stats.totalVerifiedUsers.toLocaleString()}
          icon="✅"
          color="purple"
        />
        <StatCard
          title="Conversion Rate"
          value={`${conversionRate}%`}
          icon="📊"
          color="indigo"
        />
      </div>

      {/* Revenue & Payouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 Earnings</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <span className="text-gray-700">Total Revenue Generated</span>
              <span className="text-2xl font-bold text-green-600">
                ${data.partner.stats.totalRevenue.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <span className="text-gray-700">Total Paid Out</span>
              <span className="text-2xl font-bold text-blue-600">
                ${data.partner.stats.totalPayouts.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-yellow-50 rounded-lg">
              <span className="text-gray-700">Pending Payouts</span>
              <span className="text-2xl font-bold text-yellow-600">
                ${data.pendingPayouts.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Recent Activity (30 Days)</h3>
          <div className="space-y-3">
            {Object.entries(data.recentEvents).map(([event, count]) => (
              <div key={event} className="flex justify-between items-center">
                <span className="text-gray-700 capitalize">{event.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-gray-900">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fraud Score Warning */}
      {data.fraudScore > 0.3 && (
        <div className={`rounded-lg shadow p-6 ${
          data.fraudScore > 0.6 ? 'bg-red-50' : 'bg-yellow-50'
        }`}>
          <h3 className={`text-lg font-semibold mb-2 ${
            data.fraudScore > 0.6 ? 'text-red-900' : 'text-yellow-900'
          }`}>
            ⚠️ Account Quality Alert
          </h3>
          <p className={data.fraudScore > 0.6 ? 'text-red-700' : 'text-yellow-700'}>
            Your account has a fraud risk score of {(data.fraudScore * 100).toFixed(1)}%.
            Please ensure all traffic is organic and genuine. Accounts with scores above 75% may be suspended.
          </p>
        </div>
      )}

      {/* Referral Link Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🔗 Your Referral Links</h3>
        <div className="space-y-3">
          <ReferralLink
            platform="General"
            url={`https://avalo.app?ref=${data.partner.referralCode}`}
          />
          <ReferralLink
            platform="iOS App Store"
            url={`https://apps.apple.com/app/avalo?ref=${data.partner.referralCode}`}
          />
          <ReferralLink
            platform="Google Play Store"
            url={`https://play.google.com/store/apps/details?id=com.avalo&ref=${data.partner.referralCode}`}
          />
        </div>
      </div>
    </div>
  );
};

// Helper Components
interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    indigo: 'from-indigo-500 to-indigo-600'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`w-16 h-16 bg-gradient-to-br ${colorClasses[color]} rounded-full flex items-center justify-center text-3xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

interface ReferralLinkProps {
  platform: string;
  url: string;
}

const ReferralLink: React.FC<ReferralLinkProps> = ({ platform, url }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex-1 mr-4">
        <div className="font-semibold text-gray-900">{platform}</div>
        <div className="text-sm text-gray-600 truncate">{url}</div>
      </div>
      <button
        onClick={copyToClipboard}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
    </div>
  );
};

export default InfluencerDashboard;
