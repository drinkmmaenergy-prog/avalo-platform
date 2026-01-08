/**
 * PACK 363 — Realtime System Dashboard
 * 
 * Admin dashboard for monitoring realtime messaging performance:
 * - Latency metrics per channel
 * - P95 target compliance
 * - Failure rates
 * - Recent alerts
 * - System health status
 */

import React, { useState, useEffect } from 'react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type RealtimeChannelType = 'chat' | 'aiChat' | 'wallet' | 'support' | 'safety';

interface ChannelMetrics {
  channel: RealtimeChannelType;
  period: string;
  totalEvents: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  failureCount: number;
  failureRate: number;
}

interface LatencyAlert {
  channel: RealtimeChannelType;
  eventType: string;
  latency: number;
  threshold: number;
  severity: 'warning' | 'high' | 'critical';
  timestamp: any;
}

interface HealthScore {
  overall: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  byChannel: Record<RealtimeChannelType, number>;
}

interface DashboardData {
  metricsByChannel: Record<RealtimeChannelType, ChannelMetrics[]>;
  alerts: LatencyAlert[];
  overallHealth: HealthScore;
  generatedAt: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Pack363Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<number>(24); // hours

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call backend function
      const response = await fetch(
        `/api/generateDashboardData?hours=${timeRange}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err: any) {
      console.error('[Dashboard] Load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render loading state
  if (loading && !data) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">Loading realtime metrics...</p>
      </div>
    );
  }

  // Render error state
  if (error && !data) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Dashboard</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadDashboardData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          PACK 363 — Realtime System Monitor
        </h1>
        <p className="text-gray-600">
          Target: P95 latency {'<'} 250ms across all channels
        </p>
        <div className="mt-4 flex items-center gap-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(parseInt(e.target.value))}
            className="border border-gray-300 rounded px-3 py-2"
          >
            <option value={1}>Last Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
            <option value={72}>Last 3 Days</option>
          </select>
          <button
            onClick={loadDashboardData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
          <span className="text-sm text-gray-500">
            Last updated: {new Date(data.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Overall Health */}
      <OverallHealthCard health={data.overallHealth} />

      {/* Channel Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {Object.entries(data.metricsByChannel).map(([channel, metrics]) => (
          <ChannelMetricsCard
            key={channel}
            channel={channel as RealtimeChannelType}
            metrics={metrics}
            health={data.overallHealth.byChannel[channel as RealtimeChannelType]}
          />
        ))}
      </div>

      {/* Recent Alerts */}
      {data.alerts.length > 0 && (
        <AlertsTable alerts={data.alerts} />
      )}
    </div>
  );
}

// ============================================================================
// OVERALL HEALTH CARD
// ============================================================================

function OverallHealthCard({ health }: { health: HealthScore }) {
  const statusColors = {
    healthy: 'bg-green-100 text-green-800 border-green-200',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unhealthy: 'bg-red-100 text-red-800 border-red-200'
  };

  const statusIcons = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '🚨'
  };

  return (
    <div className={`mb-6 border rounded-lg p-6 ${statusColors[health.status]}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">
            {statusIcons[health.status]} System Health
          </h2>
          <p className="text-sm opacity-75">Overall realtime system status</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold">{health.overall}</div>
          <div className="text-sm opacity-75">Health Score</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHANNEL METRICS CARD
// ============================================================================

function ChannelMetricsCard({
  channel,
  metrics,
  health
}: {
  channel: RealtimeChannelType;
  metrics: ChannelMetrics[];
  health: number;
}) {
  const latest = metrics[0];

  const channelNames: Record<RealtimeChannelType, string> = {
    chat: '💬 Chat',
    aiChat: '🤖 AI Companions',
    wallet: '💰 Wallet',
    support: '🎧 Support',
    safety: '🛡️ Safety'
  };

  const isHealthy = latest && latest.p95Latency <= 250;
  const cardBorder = isHealthy ? 'border-green-300' : 'border-red-300';

  return (
    <div className={`border-2 rounded-lg p-4 bg-white ${cardBorder}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg">{channelNames[channel]}</h3>
        <span className={`text-sm font-semibold ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>
          {isHealthy ? '✓ OK' : '✗ SLOW'}
        </span>
      </div>

      {latest ? (
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-600 mb-1">P95 Latency</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{latest.p95Latency}ms</span>
              <span className="text-sm text-gray-500">/ 250ms target</span>
            </div>
            <div className="mt-1 h-2 bg-gray-200 rounded overflow-hidden">
              <div
                className={`h-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, (latest.p95Latency / 250) * 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-600">Avg Latency</div>
              <div className="font-semibold">{latest.avgLatency}ms</div>
            </div>
            <div>
              <div className="text-gray-600">P99 Latency</div>
              <div className="font-semibold">{latest.p99Latency}ms</div>
            </div>
            <div>
              <div className="text-gray-600">Events</div>
              <div className="font-semibold">{latest.totalEvents.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Failure Rate</div>
              <div className={`font-semibold ${latest.failureRate > 1 ? 'text-red-600' : 'text-green-600'}`}>
                {latest.failureRate}%
              </div>
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="text-xs text-gray-500">
              Health Score: <span className="font-semibold">{health}/100</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          No metrics available
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ALERTS TABLE
// ============================================================================

function AlertsTable({ alerts }: { alerts: LatencyAlert[] }) {
  const severityColors = {
    warning: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-6 py-3 border-b">
        <h3 className="font-bold text-lg">Recent High Latency Alerts</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Channel
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Event Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Latency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Severity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {alerts.slice(0, 20).map((alert, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">
                  {new Date(alert.timestamp?.toMillis?.() || alert.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {alert.channel}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {alert.eventType}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-red-600">
                  {alert.latency}ms
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${severityColors[alert.severity]}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
