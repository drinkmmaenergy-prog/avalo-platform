/**
 * PACK 379 — Executive Reputation & ASO Dashboard
 * Real-time monitoring and analytics
 */

import React, { useState, useEffect } from 'react';
import {
  Shield, TrendingUp, AlertTriangle, Star, Users,
  Globe, Activity, CheckCircle, XCircle
} from 'lucide-react';

interface DashboardData {
  overallHealth: number;
  asoHealth: any;
  reviewHealth: any;
  trustDistribution: any;
  activeAlerts: any[];
  countryReputation: any;
  generatedAt: string;
}

export const ReputationDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [crisisModeActive, setCrisisModeActive] = useState(false);

  useEffect(() => {
    loadDashboardData();
    
    // Refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Call Cloud Function
      const response = await fetch('/api/pack379/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeRange })
      });
      
      const result = await response.json();
      setData(result);
      
      // Check if crisis mode is active
      const crisisResponse = await fetch('/api/pack379/crisis-status');
      const crisisData = await crisisResponse.json();
      setCrisisModeActive(crisisData.active);
      
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCrisisMode = async (action: 'activate' | 'deactivate') => {
    try {
      await fetch('/api/pack379/crisis-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action,
          reason: action === 'activate' ? 'Manual activation from dashboard' : undefined
        })
      });
      
      await loadDashboardData();
      alert(`Crisis mode ${action}d successfully`);
    } catch (error) {
      console.error('Failed to update crisis mode:', error);
      alert('Failed to update crisis mode');
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-8 h-8 text-blue-600" />
              Reputation & ASO Control Center
            </h1>
            <p className="text-gray-600 mt-1">
              Last updated: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Time Range Selector */}
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            
            {/* Crisis Mode Toggle */}
            <button
              onClick={() => handleCrisisMode(crisisModeActive ? 'deactivate' : 'activate')}
              className={`px-6 py-2 rounded-lg font-semibold ${
                crisisModeActive 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {crisisModeActive ? '🚨 Crisis Mode Active' : 'Activate Crisis Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Crisis Mode Banner */}
      {crisisModeActive && (
        <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-bold text-red-900">Crisis Mode Active</h3>
              <p className="text-red-700 text-sm">
                Protective measures enabled: Review prompts frozen, trust thresholds raised, 
                suspicious accounts locked, emergency support routing active.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overall Health Score */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <HealthScoreCard
          title="Overall Health"
          score={data.overallHealth}
          icon={<Activity className="w-6 h-6" />}
          color={getHealthColor(data.overallHealth)}
        />
        <HealthScoreCard
          title="Review Health"
          score={data.reviewHealth.healthScore}
          icon={<Star className="w-6 h-6" />}
          color={getHealthColor(data.reviewHealth.healthScore)}
        />
        <HealthScoreCard
          title="Trust Distribution"
          score={calculateTrustScore(data.trustDistribution)}
          icon={<Users className="w-6 h-6" />}
          color={getHealthColor(calculateTrustScore(data.trustDistribution))}
        />
        <HealthScoreCard
          title="Active Alerts"
          score={data.activeAlerts.length}
          icon={<AlertTriangle className="w-6 h-6" />}
          color={data.activeAlerts.length > 5 ? 'red' : data.activeAlerts.length > 0 ? 'yellow' : 'green'}
          isCount
        />
      </div>

      {/* ASO Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            ASO Performance
          </h2>
          
          {data.asoHealth.status === 'healthy' ? (
            <div className="space-y-4">
              {Object.entries(data.asoHealth.platforms).map(([platform, metrics]: [string, any]) => (
                <div key={platform} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-lg capitalize">{platform}</h3>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <MetricItem 
                      label="Conversion Rate" 
                      value={`${(metrics.avgConversionRate * 100).toFixed(2)}%`}
                      trend={metrics.trend}
                    />
                    <MetricItem 
                      label="Avg Rating" 
                      value={metrics.avgRating.toFixed(2)}
                      icon={<Star className="w-4 h-4" />}
                    />
                    <MetricItem 
                      label="Total Installs" 
                      value={metrics.totalInstalls.toLocaleString()}
                      trend={metrics.trend}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No ASO data available</div>
          )}
        </div>

        {/* Review Health Details */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Review Health
          </h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Reviews</span>
              <span className="font-semibold text-lg">{data.reviewHealth.totalReviews}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Average Rating</span>
              <span className="font-semibold text-lg flex items-center gap-1">
                {data.reviewHealth.avgRating.toFixed(2)}
                <Star className="w-4 h-4 text-yellow-500 fill-current" />
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Flagged Reviews</span>
              <span className={`font-semibold text-lg ${
                data.reviewHealth.flaggedCount > 10 ? 'text-red-600' : 'text-gray-900'
              }`}>
                {data.reviewHealth.flaggedCount}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">High Suspicion</span>
              <span className={`font-semibold text-lg ${
                data.reviewHealth.highSuspicionCount > 5 ? 'text-orange-600' : 'text-gray-900'
              }`}>
                {data.reviewHealth.highSuspicionCount}
              </span>
            </div>
            
            {/* Health Score Gauge */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Health Score</span>
                <span className="text-sm font-semibold">{data.reviewHealth.healthScore.toFixed(0)}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full ${getHealthColor(data.reviewHealth.healthScore)}`}
                  style={{ width: `${data.reviewHealth.healthScore}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Score Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Trust Score Distribution
          </h2>
          
          <div className="space-y-3">
            <TrustScoreBar 
              label="Excellent (86-100)"
              count={data.trustDistribution.excellent}
              color="bg-green-500"
            />
            <TrustScoreBar 
              label="High (71-85)"
              count={data.trustDistribution.high}
              color="bg-blue-500"
            />
            <TrustScoreBar 
              label="Medium (41-70)"
              count={data.trustDistribution.medium}
              color="bg-yellow-500"
            />
            <TrustScoreBar 
              label="Low (0-40)"
              count={data.trustDistribution.low}
              color="bg-red-500"
            />
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Active Alerts ({data.activeAlerts.length})
          </h2>
          
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {data.activeAlerts.length > 0 ? (
              data.activeAlerts.map((alert: any) => (
                <div key={alert.id} className="border-l-4 border-red-500 bg-red-50 rounded p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">
                        {alert.attacks?.map((a: any) => a.type).join(', ') || 'Alert'}
                      </h3>
                      <p className="text-xs text-gray-600 mt-1">
                        {alert.affectedReviews} reviews affected
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.detectedAt.seconds * 1000).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      alert.severity === 'critical' ? 'bg-red-600 text-white' :
                      alert.severity === 'high' ? 'bg-orange-500 text-white' :
                      'bg-yellow-500 text-white'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>No active alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Country Reputation Map */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-green-600" />
          Country Reputation Overview
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Object.entries(data.countryReputation).map(([country, info]: [string, any]) => (
            <div key={country} className="border rounded-lg p-3 text-center">
              <div className="text-2xl mb-2">{getCountryFlag(country)}</div>
              <div className="text-xs font-semibold text-gray-700">{country}</div>
              <div className="text-sm font-bold mt-1">{info.score.toFixed(0)}/100</div>
              <div className={`text-xs mt-1 ${
                info.riskLevel === 'low' ? 'text-green-600' :
                info.riskLevel === 'medium' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {info.riskLevel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper Components

interface HealthScoreCardProps {
  title: string;
  score: number;
  icon: React.ReactNode;
  color: string;
  isCount?: boolean;
}

const HealthScoreCard: React.FC<HealthScoreCardProps> = ({ 
  title, score, icon, color, isCount = false 
}) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center justify-between mb-2">
      <span className="text-gray-600 text-sm">{title}</span>
      <div className={`text-${color}-600`}>{icon}</div>
    </div>
    <div className="text-3xl font-bold">
      {isCount ? score : `${score.toFixed(0)}${isCount ? '' : '%'}`}
    </div>
    {!isCount && (
      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full bg-${color}-500`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
    )}
  </div>
);

interface MetricItemProps {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  icon?: React.ReactNode;
}

const MetricItem: React.FC<MetricItemProps> = ({ label, value, trend, icon }) => (
  <div>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="text-lg font-semibold flex items-center gap-1">
      {value}
      {icon}
      {trend && (
        <span className={`text-xs ${
          trend === 'up' ? 'text-green-600' : 
          trend === 'down' ? 'text-red-600' : 
          'text-gray-400'
        }`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
        </span>
      )}
    </div>
  </div>
);

interface TrustScoreBarProps {
  label: string;
  count: number;
  color: string;
}

const TrustScoreBar: React.FC<TrustScoreBarProps> = ({ label, count, color }) => {
  const total = 10000; // Approximate total for percentage
  const percentage = (count / total) * 100;
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{count.toLocaleString()}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
};

// Helper Functions

function getHealthColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function calculateTrustScore(distribution: any): number {
  const total = distribution.low + distribution.medium + distribution.high + distribution.excellent;
  if (total === 0) return 0;
  
  // Weighted average
  const score = (
    (distribution.low * 20) +
    (distribution.medium * 55) +
    (distribution.high * 78) +
    (distribution.excellent * 93)
  ) / total;
  
  return score;
}

function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    'US': '🇺🇸',
    'GB': '🇬🇧',
    'CA': '🇨🇦',
    'DE': '🇩🇪',
    'FR': '🇫🇷',
    'IT': '🇮🇹',
    'ES': '🇪🇸',
    'JP': '🇯🇵',
    'KR': '🇰🇷',
    'BR': '🇧🇷',
    'MX': '🇲🇽',
    'AU': '🇦🇺',
    'IN': '🇮🇳',
    'CN': '🇨🇳'
  };
  
  return flags[countryCode] || '🌍';
}

export default ReputationDashboard;
