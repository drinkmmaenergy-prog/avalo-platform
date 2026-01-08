/**
 * PACK 362 — Performance Monitoring Dashboard
 * 
 * Real-time performance metrics for mobile & web clients:
 * - Startup times
 * - Battery usage
 * - Network quality
 * - Cache efficiency
 * - Sync queue status
 */

import React, { useEffect, useState } from 'react';

type PerformanceMetrics = {
  // Startup metrics
  avgColdStartTime: number;
  avgWarmStartTime: number;
  p95ColdStartTime: number;
  p95WarmStartTime: number;
  
  // Battery metrics
  batteryModeDistribution: {
    normal: number;
    lowPower: number;
    ultraLow: number;
  };
  avgBatteryLevel: number;
  
  // Network metrics
  networkQualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    offline: number;
  };
  avgRequestLatency: number;
  
  // Cache metrics
  cacheHitRate: number;
  avgCacheSize: number;
  staleCacheRate: number;
  
  // Sync metrics
  avgSyncQueueSize: number;
  syncSuccessRate: number;
  syncConflictRate: number;
  
  // PWA metrics
  pwaInstallRate: number;
  offlineUsageRate: number;
  serviceWorkerCacheHitRate: number;
};

type DeviceStats = {
  platform: 'iOS' | 'Android' | 'Web';
  version: string;
  count: number;
  avgPerformanceScore: number;
};

type PerformanceAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
};

export default function Pack362Dashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [deviceStats, setDeviceStats] = useState<DeviceStats[]>([]);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    loadPerformanceData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadPerformanceData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  async function loadPerformanceData() {
    try {
      // In production, these would be real API calls
      setMetrics(getMockMetrics());
      setDeviceStats(getMockDeviceStats());
      setAlerts(getMockAlerts());
      setLoading(false);
    } catch (error) {
      console.error('Failed to load performance data:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading performance metrics...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">No performance data available</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">PACK 362 — Performance Dashboard</h1>
        <p className="text-gray-600 mt-2">Real-time client performance monitoring</p>
      </div>

      {/* Time Range Selector */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Performance Alerts</h2>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.severity === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{alert.message}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {alert.metric}: {alert.value} (threshold: {alert.threshold})
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Cold Start Time */}
        <MetricCard
          title="Cold Start Time"
          value={`${metrics.avgColdStartTime.toFixed(0)}ms`}
          subtitle={`P95: ${metrics.p95ColdStartTime.toFixed(0)}ms`}
          target="< 1400ms"
          status={metrics.avgColdStartTime < 1400 ? 'good' : 'warning'}
        />

        {/* Warm Start Time */}
        <MetricCard
          title="Warm Start Time"
          value={`${metrics.avgWarmStartTime.toFixed(0)}ms`}
          subtitle={`P95: ${metrics.p95WarmStartTime.toFixed(0)}ms`}
          target="< 600ms"
          status={metrics.avgWarmStartTime < 600 ? 'good' : 'warning'}
        />

        {/* Cache Hit Rate */}
        <MetricCard
          title="Cache Hit Rate"
          value={`${(metrics.cacheHitRate * 100).toFixed(1)}%`}
          subtitle={`Avg size: ${(metrics.avgCacheSize / 1024).toFixed(1)}KB`}
          target="> 80%"
          status={metrics.cacheHitRate > 0.8 ? 'good' : 'warning'}
        />

        {/* Sync Success Rate */}
        <MetricCard
          title="Sync Success Rate"
          value={`${(metrics.syncSuccessRate * 100).toFixed(1)}%`}
          subtitle={`Queue: ${metrics.avgSyncQueueSize.toFixed(0)} items`}
          target="> 95%"
          status={metrics.syncSuccessRate > 0.95 ? 'good' : 'warning'}
        />
      </div>

      {/* Battery & Network Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Battery Mode Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Battery Mode Distribution</h3>
          <div className="space-y-3">
            <DistributionBar
              label="Normal"
              value={metrics.batteryModeDistribution.normal}
              color="bg-green-500"
            />
            <DistributionBar
              label="Low Power"
              value={metrics.batteryModeDistribution.lowPower}
              color="bg-yellow-500"
            />
            <DistributionBar
              label="Ultra Low"
              value={metrics.batteryModeDistribution.ultraLow}
              color="bg-red-500"
            />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Avg battery level: <span className="font-semibold">{(metrics.avgBatteryLevel * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Network Quality Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Network Quality Distribution</h3>
          <div className="space-y-3">
            <DistributionBar
              label="Excellent"
              value={metrics.networkQualityDistribution.excellent}
              color="bg-green-600"
            />
            <DistributionBar
              label="Good"
              value={metrics.networkQualityDistribution.good}
              color="bg-green-400"
            />
            <DistributionBar
              label="Fair"
              value={metrics.networkQualityDistribution.fair}
              color="bg-yellow-400"
            />
            <DistributionBar
              label="Poor"
              value={metrics.networkQualityDistribution.poor}
              color="bg-orange-500"
            />
            <DistributionBar
              label="Offline"
              value={metrics.networkQualityDistribution.offline}
              color="bg-gray-500"
            />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Avg latency: <span className="font-semibold">{metrics.avgRequestLatency.toFixed(0)}ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Device Statistics */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Device Statistics</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-4 text-sm font-semibold text-gray-700">Platform</th>
                <th className="text-left py-2 px-4 text-sm font-semibold text-gray-700">Version</th>
                <th className="text-right py-2 px-4 text-sm font-semibold text-gray-700">Users</th>
                <th className="text-right py-2 px-4 text-sm font-semibold text-gray-700">Perf Score</th>
              </tr>
            </thead>
            <tbody>
              {deviceStats.map((stat, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-900">{stat.platform}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{stat.version}</td>
                  <td className="py-3 px-4 text-sm text-gray-900 text-right">{stat.count.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                      stat.avgPerformanceScore >= 90 ? 'bg-green-100 text-green-800' :
                      stat.avgPerformanceScore >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {stat.avgPerformanceScore.toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PWA Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">PWA Metrics</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-3xl font-bold text-blue-600">{(metrics.pwaInstallRate * 100).toFixed(1)}%</div>
            <div className="text-sm text-gray-600 mt-1">Install Rate</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">{(metrics.offlineUsageRate * 100).toFixed(1)}%</div>
            <div className="text-sm text-gray-600 mt-1">Offline Usage</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">{(metrics.serviceWorkerCacheHitRate * 100).toFixed(1)}%</div>
            <div className="text-sm text-gray-600 mt-1">SW Cache Hit Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  target, 
  status 
}: { 
  title: string;
  value: string;
  subtitle: string;
  target: string;
  status: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    critical: 'border-red-200 bg-red-50',
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${statusColors[status]}`}>
      <div className="text-sm font-medium text-gray-600 mb-1">{title}</div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-600">{subtitle}</div>
      <div className="text-xs text-gray-500 mt-2">Target: {target}</div>
    </div>
  );
}

function DistributionBar({ 
  label, 
  value, 
  color 
}: { 
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

// Mock data generators (replace with real API calls in production)

function getMockMetrics(): PerformanceMetrics {
  return {
    avgColdStartTime: 1250,
    avgWarmStartTime: 520,
    p95ColdStartTime: 1680,
    p95WarmStartTime: 780,
    batteryModeDistribution: {
      normal: 0.75,
      lowPower: 0.20,
      ultraLow: 0.05,
    },
    avgBatteryLevel: 0.62,
    networkQualityDistribution: {
      excellent: 0.45,
      good: 0.30,
      fair: 0.15,
      poor: 0.08,
      offline: 0.02,
    },
    avgRequestLatency: 145,
    cacheHitRate: 0.87,
    avgCacheSize: 2.4 * 1024 * 1024, // 2.4MB
    staleCacheRate: 0.08,
    avgSyncQueueSize: 2.3,
    syncSuccessRate: 0.978,
    syncConflictRate: 0.012,
    pwaInstallRate: 0.34,
    offlineUsageRate: 0.12,
    serviceWorkerCacheHitRate: 0.91,
  };
}

function getMockDeviceStats(): DeviceStats[] {
  return [
    { platform: 'iOS', version: '17.x', count: 45230, avgPerformanceScore: 94 },
    { platform: 'iOS', version: '16.x', count: 32150, avgPerformanceScore: 91 },
    { platform: 'Android', version: '14.x', count: 38920, avgPerformanceScore: 88 },
    { platform: 'Android', version: '13.x', count: 28450, avgPerformanceScore: 85 },
    { platform: 'Web', version: 'Chrome', count: 15680, avgPerformanceScore: 92 },
    { platform: 'Web', version: 'Safari', count: 12340, avgPerformanceScore: 90 },
  ];
}

function getMockAlerts(): PerformanceAlert[] {
  return [
    {
      id: '1',
      severity: 'warning',
      message: 'Cold start time exceeded target on Android 13.x',
      timestamp: Date.now() - 300000,
      metric: 'coldStartTime',
      value: 1520,
      threshold: 1400,
    },
    {
      id: '2',
      severity: 'info',
      message: 'Cache hit rate improving after optimization',
      timestamp: Date.now() - 600000,
      metric: 'cacheHitRate',
      value: 0.87,
      threshold: 0.80,
    },
  ];
}
